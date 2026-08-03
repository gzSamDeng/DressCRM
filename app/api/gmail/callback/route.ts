import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { gmailRedirectUri } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";

function emailRedirect(request: NextRequest, params: Record<string, string>) {
  const target = new URL("/email", request.url);
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError = request.nextUrl.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;
  if (oauthError) return emailRedirect(request, { error: oauthError });
  if (!code || !state || !expectedState || state !== expectedState) return emailRedirect(request, { error: "invalid_oauth_state" });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return emailRedirect(request, { error: "google_not_configured" });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: gmailRedirectUri(new URL(request.url).origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) return emailRedirect(request, { error: "token_exchange_failed" });
  const token = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  if (!profileResponse.ok) return emailRedirect(request, { error: "gmail_profile_failed" });
  const profile = await profileResponse.json() as { emailAddress: string };
  const { data: existing } = await supabase
    .from("email_accounts")
    .select("refresh_token")
    .eq("user_id", auth.user.id)
    .eq("provider", "google")
    .maybeSingle();
  const refreshToken = token.refresh_token || existing?.refresh_token;
  if (!refreshToken) return emailRedirect(request, { error: "missing_refresh_token" });

  const { error } = await supabase.from("email_accounts").upsert({
    user_id: auth.user.id,
    provider: "google",
    email: profile.emailAddress,
    access_token: token.access_token,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
    scopes: token.scope || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return emailRedirect(request, { error: "save_account_failed" });

  const response = emailRedirect(request, { connected: "1" });
  response.cookies.delete("gmail_oauth_state");
  return response;
}
