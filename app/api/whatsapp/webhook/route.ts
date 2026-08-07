import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneMatches, whatsappConfig } from "@/lib/whatsapp";
import { isMissingWhatsAppMessageTable } from "@/lib/whatsapp-store";
import type { Customer } from "@/types/database";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = whatsappConfig().verifyToken;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

function validSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret || !signature.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function messageText(message: Record<string, unknown>) {
  const type = String(message.type || "unknown");
  if (type === "text") return String((message.text as { body?: string } | undefined)?.body || "");
  const media = message[type] as { caption?: string; filename?: string } | undefined;
  return [media?.caption, media?.filename].filter(Boolean).join(" · ") || `[${type}]`;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const config = whatsappConfig();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  const body = JSON.parse(rawBody) as {
    entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }>;
  };
  const supabase = createAdminClient();
  const { data: customerData } = await supabase.from("customers").select("*").not("whatsapp", "is", null);
  const customers = (customerData || []) as Customer[];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata as { phone_number_id?: string; display_phone_number?: string } | undefined;
      const contacts = value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }> | undefined;
      const messages = value.messages as Array<Record<string, unknown>> | undefined;
      const statuses = value.statuses as Array<Record<string, unknown>> | undefined;

      for (const status of statuses || []) {
        const messageId = String(status.id || "");
        if (!messageId) continue;
        const errors = status.errors as Array<{ title?: string; message?: string }> | undefined;
        await supabase.from("whatsapp_messages").update({
          status: String(status.status || "unknown"),
          error_text: errors?.[0]?.message || errors?.[0]?.title || null,
          updated_at: new Date().toISOString(),
        }).eq("meta_message_id", messageId);
      }

      for (const message of messages || []) {
        const messageId = String(message.id || "");
        const from = String(message.from || contacts?.[0]?.wa_id || "");
        if (!messageId || !from) continue;
        const { data: existing, error: existingError } = await supabase.from("whatsapp_messages").select("id").eq("meta_message_id", messageId).maybeSingle();
        if (existing) continue;
        if (isMissingWhatsAppMessageTable(existingError)) {
          const { data: fallbackExisting } = await supabase.from("follow_ups")
            .select("id")
            .eq("channel", "WhatsApp")
            .ilike("outcome", `%wa:${messageId}%`)
            .limit(1);
          if (fallbackExisting?.length) continue;
        } else if (existingError) {
          continue;
        }
        const customer = customers.find((item) => phoneMatches(item.whatsapp, from));
        const type = String(message.type || "unknown");
        const text = messageText(message);
        const timestamp = Number(message.timestamp || 0);
        const happenedAt = timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
        const media = message[type] as { id?: string; mime_type?: string } | undefined;
        const { error } = await supabase.from("whatsapp_messages").upsert({
          meta_message_id: messageId,
          customer_id: customer?.id || null,
          direction: "inbound",
          from_number: from,
          to_number: metadata?.display_phone_number || metadata?.phone_number_id || config.phoneNumberId,
          contact_name: contacts?.[0]?.profile?.name || null,
          message_type: type,
          text_body: text,
          media_id: media?.id || null,
          media_mime_type: media?.mime_type || null,
          status: "received",
          raw_payload: message,
          happened_at: happenedAt,
        }, { onConflict: "meta_message_id" });
        if (error && !isMissingWhatsAppMessageTable(error)) continue;
        if (!customer) continue;
        await supabase.from("follow_ups").insert({
          customer_id: customer.id,
          channel: "WhatsApp",
          summary: `客户 WhatsApp 回复：${text}`,
          outcome: `已回复 · wa:${messageId}`,
          next_action: "业务员查看消息并回复",
          happened_at: happenedAt,
          created_by: null,
        });
        await supabase.from("customers").update({
          stage: "Replied",
          next_follow_up_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        }).eq("id", customer.id);
      }
    }
  }
  revalidatePath("/follow-up");
  revalidatePath("/dashboard");
  return NextResponse.json({ received: true });
}
