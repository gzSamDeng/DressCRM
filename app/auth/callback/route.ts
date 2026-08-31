import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/reset-password";
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("Failed to exchange password recovery code", {
      code: error.code,
      message: error.message,
    });
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "密码重置链接无效或已过期，请重新申请。");
  return NextResponse.redirect(loginUrl);
}
