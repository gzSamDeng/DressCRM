import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  await supabase.from("email_accounts").delete().eq("user_id", auth.user.id).eq("provider", "google");
  return NextResponse.redirect(new URL("/email?disconnected=1", request.url), 303);
}
