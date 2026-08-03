"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { coldCadenceDays, engagedCadenceDays } from "@/lib/follow-up-priority";

function value(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function customerPayload(formData: FormData) {
  return {
    company: String(formData.get("company") ?? "").trim(),
    website: value(formData, "website"),
    country: value(formData, "country"),
    city: value(formData, "city"),
    customer_type: value(formData, "customer_type"),
    priority: String(formData.get("priority") ?? "B"),
    stage: String(formData.get("stage") ?? "New Lead"),
    product_category: String(formData.get("product_category") ?? "Unclassified"),
    premium_fit: Number(formData.get("premium_fit") ?? 0),
    couture_fit: Number(formData.get("couture_fit") ?? 0),
    price_status: value(formData, "price_status"),
    price_example: value(formData, "price_example"),
    import_probability: value(formData, "import_probability"),
    buyer_value: value(formData, "buyer_value"),
    contact_email: value(formData, "contact_email"),
    whatsapp: value(formData, "whatsapp"),
    recommended_line: value(formData, "recommended_line"),
    evidence: value(formData, "evidence"),
    source_url: value(formData, "source_url"),
    notes: value(formData, "notes"),
    next_follow_up_at: value(formData, "next_follow_up_at"),
  };
}

export async function createCustomer(formData: FormData) {
  const supabase = await createClient();
  const payload = customerPayload(formData);
  const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(customerPayload(formData)).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  redirect("/");
}

export type FollowUpActionState = { ok: boolean; message: string };

export async function addFollowUp(
  customerId: string,
  _previousState: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) return { ok: false, message: "请填写跟进摘要。" };
  const happenedAt = new Date(value(formData, "happened_at") ?? new Date().toISOString());
  if (Number.isNaN(happenedAt.getTime())) return { ok: false, message: "跟进时间格式不正确。" };
  const payload = {
    customer_id: customerId,
    channel: String(formData.get("channel") ?? "Email"),
    summary,
    outcome: value(formData, "outcome"),
    next_action: value(formData, "next_action"),
    happened_at: happenedAt.toISOString(),
    created_by: auth.user?.id ?? null,
  };
  const { error } = await supabase.from("follow_ups").insert(payload);
  if (error) {
    console.error("Failed to save follow-up", { code: error.code, message: error.message, customerId });
    return { ok: false, message: `保存失败：${error.message}` };
  }
  const outcome = payload.outcome ?? "无回复";
  const stopped = ["明确拒绝", "退订", "联系方式无效"].includes(outcome);
  const replied = ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"].includes(outcome);
  const manualNext = value(formData, "next_follow_up_at");
  const { data: customer } = await supabase.from("customers").select("priority").eq("id", customerId).single();
  const cadence = (replied ? engagedCadenceDays : coldCadenceDays)[customer?.priority ?? "B"] ?? 30;
  const automaticNext = new Date(happenedAt.getTime() + cadence * 86_400_000).toISOString();
  const customerUpdate: { next_follow_up_at: string | null; stage?: string } = {
    next_follow_up_at: stopped ? null : manualNext ? new Date(`${manualNext}T09:00:00`).toISOString() : automaticNext,
  };
  if (stopped) customerUpdate.stage = outcome;
  else if (replied) customerUpdate.stage = "Engaged";
  await supabase.from("customers").update(customerUpdate).eq("id", customerId);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "跟进记录已保存。" };
}

export async function approveDiscoveredLead(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: lead, error: leadError } = await supabase
    .from("discovered_leads")
    .select("*")
    .eq("id", id)
    .single();
  if (leadError || !lead) throw new Error(leadError?.message ?? "待审核线索不存在。");

  let customerId: string | null = lead.customer_id;
  if (!customerId) {
    const customer = {
      company: lead.company,
      website: lead.website,
      country: lead.country,
      city: lead.city,
      customer_type: lead.customer_type,
      priority: lead.ai_grade,
      stage: "New Lead",
      product_category: "Premium Evening Dress",
      premium_fit: lead.ai_score,
      couture_fit: Math.max(0, lead.ai_score - 8),
      import_probability: (lead.signals ?? []).includes("importer") ? "High" : "Needs verification",
      buyer_value: `AI Score ${lead.ai_score} · ${lead.ai_grade}`,
      recommended_line: lead.recommendation,
      evidence: (lead.evidence ?? []).join("\n"),
      source_url: lead.source_url,
      notes: "由 AI Lead Intelligence 审核批准进入 CRM。",
    };
    const { data: inserted, error: insertError } = await supabase
      .from("customers")
      .insert(customer)
      .select("id")
      .single();
    if (insertError) {
      const { data: existing } = lead.website
        ? await supabase.from("customers").select("id").eq("website", lead.website).limit(1).maybeSingle()
        : { data: null };
      if (!existing) throw new Error(insertError.message);
      customerId = existing.id;
    } else {
      customerId = inserted.id;
    }
  }

  const { error } = await supabase.from("discovered_leads").update({
    review_status: "approved",
    customer_id: customerId,
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user?.id ?? null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/lead-intelligence");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function rejectDiscoveredLead(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("discovered_leads").update({
    review_status: "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: auth.user?.id ?? null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/lead-intelligence");
  revalidatePath("/dashboard");
}
