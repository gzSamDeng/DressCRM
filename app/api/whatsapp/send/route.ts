import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { coldCadenceDays } from "@/lib/follow-up-priority";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone, sendWhatsAppMessage, whatsappConfig, whatsappConfigured } from "@/lib/whatsapp";
import { isMissingWhatsAppMessageTable } from "@/lib/whatsapp-store";
import type { Customer } from "@/types/database";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
    if (!whatsappConfigured()) {
      return NextResponse.json({ error: "WhatsApp Business Platform 尚未完成管理员配置。" }, { status: 503 });
    }
    const payload = await request.json() as {
      customer_id?: string;
      mode?: "text" | "template";
      text?: string;
      template_name?: string;
      template_language?: string;
      template_parameters?: string[];
    };
    if (!payload.customer_id) return NextResponse.json({ error: "请选择客户。" }, { status: 400 });
    const { data } = await supabase.from("customers").select("*").eq("id", payload.customer_id).single();
    if (!data) return NextResponse.json({ error: "客户不存在。" }, { status: 404 });
    const customer = data as Customer;
    const to = normalizePhone(customer.whatsapp);
    if (!to) return NextResponse.json({ error: "该客户没有有效 WhatsApp 号码。" }, { status: 400 });

    const mode = payload.mode === "template" ? "template" : "text";
    let messageBody = "";
    let messageId = "";
    if (mode === "template") {
      const templateName = payload.template_name?.trim();
      if (!templateName) return NextResponse.json({ error: "请填写 Meta 已审核通过的模板名称。" }, { status: 400 });
      const language = payload.template_language?.trim() || "en_US";
      const parameters = (payload.template_parameters || []).map((value) => value.trim()).filter(Boolean);
      messageId = await sendWhatsAppMessage({
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          ...(parameters.length ? { components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] } : {}),
        },
      });
      messageBody = `[Template] ${templateName} (${language})${parameters.length ? ` · ${parameters.join(" · ")}` : ""}`;
    } else {
      messageBody = payload.text?.trim() || "";
      if (!messageBody) return NextResponse.json({ error: "请填写消息内容。" }, { status: 400 });
      const windowStart = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { count, error: windowError } = await supabase.from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id)
        .eq("direction", "inbound")
        .gte("happened_at", windowStart);
      let hasOpenWindow = Boolean(count);
      if (isMissingWhatsAppMessageTable(windowError)) {
        const { count: fallbackCount } = await supabase.from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customer.id)
          .eq("channel", "WhatsApp")
          .ilike("outcome", "已回复%")
          .gte("happened_at", windowStart);
        hasOpenWindow = Boolean(fallbackCount);
      } else if (windowError) {
        throw new Error(`无法检查 WhatsApp 服务窗口：${windowError.message}`);
      }
      if (!hasOpenWindow) {
        return NextResponse.json({ error: "该客户当前不在 24 小时服务窗口内，请改用 Meta 已审核模板。" }, { status: 400 });
      }
      messageId = await sendWhatsAppMessage({ to, type: "text", text: { preview_url: false, body: messageBody } });
    }

    const config = whatsappConfig();
    const happenedAt = new Date().toISOString();
    const { error: messageError } = await supabase.from("whatsapp_messages").insert({
      meta_message_id: messageId,
      customer_id: customer.id,
      direction: "outbound",
      from_number: config.displayNumber || config.phoneNumberId,
      to_number: to,
      message_type: mode,
      text_body: messageBody,
      status: "accepted",
      sent_by: auth.user.id,
      happened_at: happenedAt,
    });
    if (messageError && !isMissingWhatsAppMessageTable(messageError)) {
      throw new Error(`Meta 已接受消息，但消息记录写入失败：${messageError.message}`);
    }
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      customer_id: customer.id,
      channel: "WhatsApp",
      summary: `发送 WhatsApp ${mode === "template" ? "模板" : "消息"}：${messageBody}`,
      outcome: "无回复",
      next_action: "等待客户回复",
      happened_at: happenedAt,
      created_by: auth.user.id,
    });
    if (followUpError) throw new Error(`消息已发送，但跟进记录写入失败：${followUpError.message}`);
    const cadenceDays = coldCadenceDays[customer.priority] ?? 30;
    await supabase.from("customers").update({
      next_follow_up_at: new Date(Date.now() + cadenceDays * 86_400_000).toISOString(),
      stage: customer.stage === "New Lead" ? "WhatsApp Contacted" : customer.stage,
    }).eq("id", customer.id);
    revalidatePath("/follow-up");
    revalidatePath("/dashboard");
    revalidatePath(`/customers/${customer.id}`);
    return NextResponse.json({ ok: true, id: messageId, message: "WhatsApp 消息已发送并自动留痕。" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp 消息发送失败。" }, { status: 500 });
  }
}
