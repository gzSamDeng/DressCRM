import { NextRequest, NextResponse } from "next/server";
import { isEmailAdmin, sharedGmailAddress } from "@/lib/shared-gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!isEmailAdmin(auth.user.email)) return NextResponse.redirect(new URL("/email?error=admin_required", request.url), 303);
  const admin = createAdminClient();
  await admin.from("email_accounts").delete().eq("provider", "google").ilike("email", sharedGmailAddress());
  return NextResponse.redirect(new URL("/email?disconnected=1", request.url), 303);
}
