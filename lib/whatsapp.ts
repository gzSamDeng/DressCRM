import "server-only";

export function whatsappConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "",
    appSecret: process.env.META_APP_SECRET?.trim() || "",
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0",
    displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER?.trim() || "",
  };
}

export function whatsappConfigured() {
  const config = whatsappConfig();
  return Boolean(config.accessToken && config.phoneNumberId && config.businessAccountId && config.verifyToken && config.appSecret);
}

export function normalizePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

export function phoneMatches(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 8 && (a.endsWith(b) || b.endsWith(a));
}

export async function sendWhatsAppMessage(payload: Record<string, unknown>) {
  const config = whatsappConfig();
  if (!whatsappConfigured()) throw new Error("WhatsApp Business Platform 尚未完成管理员配置。");
  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      cache: "no-store",
    },
  );
  const data = await response.json() as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; error_user_msg?: string; code?: number };
  };
  if (!response.ok || !data.messages?.[0]?.id) {
    throw new Error(data.error?.error_user_msg || data.error?.message || "Meta WhatsApp 消息发送失败。");
  }
  return data.messages[0].id;
}
