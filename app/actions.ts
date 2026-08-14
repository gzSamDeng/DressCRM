"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppProfile, isManagementRole } from "@/lib/access-control";
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
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const profile = await getAppProfile(auth.user.id, auth.user.email);
    if (!profile.is_active) {
      await supabase.auth.signOut();
      redirect("/login?error=" + encodeURIComponent("账号已停用，请联系管理员。"));
    }
  }
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
    instagram: value(formData, "instagram"),
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

async function saveFollowUp(customerId: string, formData: FormData): Promise<FollowUpActionState> {
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
  revalidatePath("/follow-up");
  return { ok: true, message: "跟进记录已保存。" };
}

export async function addFollowUp(
  customerId: string,
  _previousState: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  return saveFollowUp(customerId, formData);
}

export async function addManualFollowUp(
  _previousState: FollowUpActionState,
  formData: FormData,
): Promise<FollowUpActionState> {
  const customerId = value(formData, "customer_id");
  if (!customerId) return { ok: false, message: "请先选择客户。" };
  return saveFollowUp(customerId, formData);
}

function leadHost(website: string | null) {
  if (!website) return "";
  try {
    const url = new URL(website.match(/^https?:\/\//i) ? website : `https://${website}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function excludeCustomerAsUnsuitable(customerId: string, reason: string): Promise<FollowUpActionState> {
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, message: "请填写客户不合适的具体原因。" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "请先登录系统。" };
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,company,website,contact_email")
    .eq("id", customerId)
    .eq("is_excluded", false)
    .single();
  if (customerError || !customer) return { ok: false, message: "客户不存在或已经被移出有效线索库。" };

  const exclusionReason = `人工确认不属于目标礼服客户：${cleanReason}`;
  const admin = createAdminClient();
  const host = leadHost(customer.website);
  const matchType = host ? "domain" : customer.contact_email ? "email" : "company";
  const matchValue = host || customer.contact_email?.trim().toLowerCase() || customer.company.trim().toLowerCase();
  const { error: exclusionError } = await admin.from("lead_exclusions").upsert({
    match_type: matchType,
    match_value: matchValue,
    reason: exclusionReason,
    created_by: auth.user.id,
  }, { onConflict: "match_type,match_value" });
  if (exclusionError) return { ok: false, message: `保存永久排除规则失败：${exclusionError.message}` };

  const now = new Date().toISOString();
  const { error: followUpError } = await supabase.from("follow_ups").insert({
    customer_id: customerId,
    channel: "Website Review",
    summary: exclusionReason,
    outcome: "客户不匹配",
    next_action: "移入审核已拒绝库，不再继续开发",
    happened_at: now,
    created_by: auth.user.id,
  });
  if (followUpError) return { ok: false, message: `保存审核记录失败：${followUpError.message}` };

  const { error: updateError } = await supabase.from("customers").update({
    is_excluded: true,
    exclusion_reason: exclusionReason,
    excluded_at: now,
    stage: "Rejected",
    next_follow_up_at: null,
  }).eq("id", customerId);
  if (updateError) return { ok: false, message: `移出客户线索失败：${updateError.message}` };

  await supabase.from("discovered_leads").update({
    review_status: "rejected",
    reviewed_at: now,
    reviewed_by: auth.user.id,
  }).eq("customer_id", customerId);
  revalidatePath("/");
  revalidatePath("/email");
  revalidatePath("/follow-up");
  revalidatePath("/dashboard");
  revalidatePath("/lead-intelligence");
  return { ok: true, message: "该客户已移入审核已拒绝库，并加入永久排除规则。" };
}

export async function markCustomerEmailInvalid(customerId: string, reason: string): Promise<FollowUpActionState> {
  const cleanReason = reason.trim();
  if (!cleanReason) return { ok: false, message: "请填写邮箱无效或退信的原因。" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "请先登录系统。" };
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,contact_email,notes")
    .eq("id", customerId)
    .eq("is_excluded", false)
    .single();
  if (customerError || !customer) return { ok: false, message: "客户不存在。" };
  if (!customer.contact_email) return { ok: false, message: "该客户当前没有联系邮箱。" };

  const now = new Date().toISOString();
  const invalidNote = `无效邮箱：${customer.contact_email}；原因：${cleanReason}；标记时间：${new Date(now).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
  const { error: followUpError } = await supabase.from("follow_ups").insert({
    customer_id: customerId,
    channel: "Email",
    summary: invalidNote,
    outcome: "邮箱无效",
    next_action: "查找新邮箱，或改用 WhatsApp、Instagram 等渠道",
    happened_at: now,
    created_by: auth.user.id,
  });
  if (followUpError) return { ok: false, message: `保存邮箱状态失败：${followUpError.message}` };

  const { error: updateError } = await supabase.from("customers").update({
    contact_email: null,
    notes: [customer.notes, invalidNote].filter(Boolean).join("\n"),
  }).eq("id", customerId);
  if (updateError) return { ok: false, message: `更新客户邮箱失败：${updateError.message}` };
  revalidatePath("/");
  revalidatePath("/email");
  revalidatePath("/follow-up");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, message: "该邮箱已标记为无效并从待发邮件清单移除；客户仍可通过其他渠道继续跟进。" };
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
      contact_email: lead.contact_email,
      whatsapp: lead.whatsapp || lead.contact_phone,
      instagram: lead.instagram,
      recommended_line: lead.recommendation,
      evidence: (lead.evidence ?? []).join("\n"),
      source_url: lead.source_url,
      notes: [
        "由 AI Lead Intelligence 审核批准进入 CRM。",
        lead.contact_name ? `联系人：${lead.contact_name}` : null,
        lead.contact_phone ? `电话：${lead.contact_phone}` : null,
        lead.instagram ? `Instagram：${lead.instagram}` : null,
        lead.facebook ? `Facebook：${lead.facebook}` : null,
        lead.linkedin ? `LinkedIn：${lead.linkedin}` : null,
        lead.exhibitor_source ? `展会来源：${lead.exhibitor_source}` : null,
      ].filter(Boolean).join("\n"),
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
  if (customerId && lead.lead_source === "customs_import") {
    const { error: recordError } = await supabase.from("customs_import_records").update({
      customer_id: customerId,
      review_status: "approved",
    }).eq("discovered_lead_id", id);
    if (recordError) throw new Error(recordError.message);
    const { data: records, error: recordsError } = await supabase
      .from("customs_import_records")
      .select("import_date")
      .eq("customer_id", customerId)
      .eq("review_status", "approved");
    if (recordsError) throw new Error(recordsError.message);
    const dates = (records ?? []).map((record) => record.import_date).filter(Boolean).sort();
    const { error: aggregateError } = await supabase.from("customers").update({
      has_customs_import_records: dates.length > 0,
      customs_import_count: dates.length,
      first_customs_import_at: dates[0] ?? null,
      latest_customs_import_at: dates[dates.length - 1] ?? null,
    }).eq("id", customerId);
    if (aggregateError) throw new Error(aggregateError.message);
  }
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
  const { error: customsError } = await supabase.from("customs_import_records").update({
    review_status: "rejected",
  }).eq("discovered_lead_id", id);
  if (customsError && customsError.code !== "42P01") throw new Error(customsError.message);
  revalidatePath("/lead-intelligence");
  revalidatePath("/dashboard");
}

export async function restoreExcludedCustomer(customerId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录系统。");

  const admin = createAdminClient();
  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id,company,website,contact_email,is_excluded")
    .eq("id", customerId)
    .single();
  if (customerError || !customer) throw new Error(customerError?.message ?? "客户不存在。");
  if (!customer.is_excluded) throw new Error("该客户已经在客户线索库中，无需再次恢复。");

  const host = leadHost(customer.website);
  const matchers = [
    host ? { match_type: "domain", match_value: host } : null,
    customer.contact_email ? { match_type: "email", match_value: customer.contact_email.trim().toLowerCase() } : null,
    customer.company ? { match_type: "company", match_value: customer.company.trim().toLowerCase() } : null,
  ].filter((item): item is { match_type: string; match_value: string } => Boolean(item?.match_value));

  for (const matcher of matchers) {
    const { error: exclusionError } = await admin
      .from("lead_exclusions")
      .delete()
      .eq("match_type", matcher.match_type)
      .eq("match_value", matcher.match_value);
    if (exclusionError && exclusionError.code !== "42P01") throw new Error(exclusionError.message);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("customers").update({
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    stage: "New Lead",
    next_follow_up_at: now,
  }).eq("id", customerId);
  if (updateError) throw new Error(updateError.message);

  const { error: discoveredLeadError } = await admin.from("discovered_leads").update({
    review_status: "approved",
    reviewed_at: now,
    reviewed_by: auth.user.id,
  }).eq("customer_id", customerId);
  if (discoveredLeadError) throw new Error(discoveredLeadError.message);

  const { error: followUpError } = await admin.from("follow_ups").insert({
    customer_id: customerId,
    channel: "System",
    summary: "从审核已拒绝库恢复客户线索",
    outcome: "恢复客户",
    next_action: "重新检查客户背景并安排跟进",
    happened_at: now,
    created_by: auth.user.id,
  });
  if (followUpError) throw new Error(followUpError.message);

  revalidatePath("/");
  revalidatePath("/email");
  revalidatePath("/follow-up");
  revalidatePath("/dashboard");
  revalidatePath("/lead-intelligence");
  revalidatePath(`/customers/${customerId}`);
}

export async function restoreDiscoveredLead(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录系统。");
  const { data: lead, error: leadError } = await supabase
    .from("discovered_leads")
    .select("id,review_status,customer_id")
    .eq("id", id)
    .single();
  if (leadError || !lead) throw new Error(leadError?.message ?? "线索不存在。");
  if (lead.review_status !== "rejected") throw new Error("只有已拒绝线索可以恢复。");

  if (lead.customer_id) {
    const admin = createAdminClient();
    const { data: customer } = await admin
      .from("customers")
      .select("is_excluded")
      .eq("id", lead.customer_id)
      .maybeSingle();
    if (customer?.is_excluded) {
      await restoreExcludedCustomer(lead.customer_id);
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from("discovered_leads").update({
      review_status: "approved",
      reviewed_at: now,
      reviewed_by: auth.user.id,
    }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("discovered_leads").update({
      review_status: "pending",
      reviewed_at: null,
      reviewed_by: null,
    }).eq("id", id);
    if (error) throw new Error(error.message);
    const { error: customsError } = await supabase.from("customs_import_records").update({
      review_status: "pending",
    }).eq("discovered_lead_id", id);
    if (customsError && customsError.code !== "42P01") throw new Error(customsError.message);
  }

  revalidatePath("/lead-intelligence");
  revalidatePath("/dashboard");
}

export async function assignCustomer(customerId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录系统。");
  const current = await getAppProfile(auth.user.id, auth.user.email);
  if (!isManagementRole(current.role)) throw new Error("只有业务总监或老板可以分配客户。");

  const ownerId = value(formData, "owner_id");
  const admin = createAdminClient();
  if (current.role === "sales_director") {
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("owner_id")
      .eq("id", customerId)
      .single();
    if (customerError || !customer) throw new Error("客户不存在。");
    if (customer.owner_id) {
      const { data: existingOwner } = await admin
        .from("user_profiles")
        .select("team_id")
        .eq("id", customer.owner_id)
        .single();
      if (existingOwner?.team_id !== current.team_id) {
        throw new Error("业务总监不能调整其他团队的客户。");
      }
    }
  }
  if (ownerId) {
    const { data: target, error: targetError } = await admin
      .from("user_profiles")
      .select("id,team_id,is_active")
      .eq("id", ownerId)
      .single();
    if (targetError || !target?.is_active) throw new Error("目标业务员不存在或已停用。");
    if (current.role === "sales_director" && target.team_id !== current.team_id) {
      throw new Error("业务总监只能把客户分配给自己团队的成员。");
    }
  }

  const { error } = await admin.from("customers").update({
    owner_id: ownerId,
    assigned_by: auth.user.id,
    assigned_at: new Date().toISOString(),
  }).eq("id", customerId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${customerId}`);
}
