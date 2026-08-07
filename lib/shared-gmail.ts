import "server-only";
import { gmailConfigured } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailAccount } from "@/types/database";

export function sharedGmailAddress() {
  return (process.env.SHARED_GMAIL_ADDRESS || "gzsamdeng168@gmail.com").trim().toLowerCase();
}

export function emailAdminAddress() {
  return (process.env.EMAIL_ADMIN_EMAIL || "abrahamlinkin@126.com").trim().toLowerCase();
}

export function isEmailAdmin(email?: string | null) {
  return Boolean(email && email.trim().toLowerCase() === emailAdminAddress());
}

export function sharedGmailConfigured() {
  return Boolean(gmailConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getSharedGmailAccount() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("provider", "google")
    .ilike("email", sharedGmailAddress())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { supabase, account: data as EmailAccount | null };
}
