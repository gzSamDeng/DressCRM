import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whatsappConfig, whatsappConfigured } from "@/lib/whatsapp";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
  if (!whatsappConfigured()) return NextResponse.json({ error: "WhatsApp Business Platform 尚未完成管理员配置。" }, { status: 503 });

  const config = whatsappConfig();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${config.businessAccountId}/message_templates`);
  url.searchParams.set("status", "APPROVED");
  url.searchParams.set("fields", "name,language,category,components,status");
  url.searchParams.set("limit", "250");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
  });
  const data = await response.json() as {
    data?: Array<{ name: string; language: string; category?: string; status?: string }>;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!response.ok) {
    return NextResponse.json({ error: data.error?.error_user_msg || data.error?.message || "读取 Meta 模板失败。" }, { status: 502 });
  }
  return NextResponse.json({ templates: data.data || [] });
}

