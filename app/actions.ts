"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function addFollowUp(customerId: string, formData: FormData) {
  const supabase = await createClient();
  const payload = {
    customer_id: customerId,
    channel: String(formData.get("channel") ?? "Email"),
    summary: String(formData.get("summary") ?? "").trim(),
    outcome: value(formData, "outcome"),
    next_action: value(formData, "next_action"),
    happened_at: String(formData.get("happened_at") ?? new Date().toISOString()),
  };
  const { error } = await supabase.from("follow_ups").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath(`/customers/${customerId}`);
}
