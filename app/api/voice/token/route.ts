import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { voiceConfig, voiceConfigured } from "@/lib/voice";

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "网页电话尚未完成 Telnyx 线路配置。" }, { status: 503 });
  }

  const config = voiceConfig();
  const response = await fetch(
    `https://api.telnyx.com/v2/telephony_credentials/${config.telephonyCredentialId}/token`,
    { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, cache: "no-store" },
  );
  const payload = await response.json() as {
    data?: string | { token?: string; jwt?: string };
    token?: string;
    errors?: Array<{ detail?: string; title?: string }>;
  };
  const token = typeof payload.data === "string"
    ? payload.data
    : payload.data?.token || payload.data?.jwt || payload.token;
  if (!response.ok || !token) {
    return NextResponse.json(
      { error: payload.errors?.[0]?.detail || payload.errors?.[0]?.title || "Telnyx 电话令牌生成失败。" },
      { status: 502 },
    );
  }
  return NextResponse.json({ token, callerNumber: config.callerNumber });
}
