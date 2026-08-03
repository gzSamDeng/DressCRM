import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { coldCadenceDays } from "@/lib/follow-up-priority";
import { buildRawEmail, getGmailAccount, sendGmailMessage } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
    const account = await getGmailAccount(supabase, auth.user.id);
    if (!account) return NextResponse.json({ error: "请先连接 Google 邮箱。" }, { status: 400 });

    const formData = await request.formData();
    const customerId = String(formData.get("customer_id") || "");
    const to = String(formData.get("to") || "").trim();
    const cc = String(formData.get("cc") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    const body = String(formData.get("body") || "").trim();
    if (!customerId || !emailPattern.test(to) || !subject || !body) {
      return NextResponse.json({ error: "请选择客户，并填写有效收件人、主题和正文。" }, { status: 400 });
    }
    const ccAddresses = cc ? cc.split(/[;,]/).map((value) => value.trim()).filter(Boolean) : [];
    if (ccAddresses.some((address) => !emailPattern.test(address))) {
      return NextResponse.json({ error: "抄送邮箱格式不正确。" }, { status: 400 });
    }

    const { data: customerData, error: customerError } = await supabase.from("customers").select("*").eq("id", customerId).single();
    if (customerError || !customerData) return NextResponse.json({ error: "客户线索不存在。" }, { status: 404 });
    const customer = customerData as Customer;
    if (!customer.contact_email || customer.contact_email.trim().toLowerCase() !== to.toLowerCase()) {
      return NextResponse.json({ error: "收件人必须是该客户在线索中登记的联系邮箱。" }, { status: 400 });
    }

    const file = formData.get("attachment");
    let attachment: { name: string; type: string; bytes: Buffer } | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "MVP 版本附件请控制在 8MB 以内。" }, { status: 400 });
      attachment = { name: file.name, type: file.type || "application/octet-stream", bytes: Buffer.from(await file.arrayBuffer()) };
    }

    const raw = buildRawEmail({ from: account.email, to, cc: ccAddresses.join(", "), subject, body, attachment });
    const sent = await sendGmailMessage(supabase, account, raw);
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      customer_id: customer.id,
      channel: "Email",
      summary: `发送邮件：${subject}`,
      outcome: "无回复",
      next_action: "等待客户回复",
      happened_at: new Date().toISOString(),
      created_by: auth.user.id,
    });
    if (followUpError) return NextResponse.json({ error: `邮件已发送，但跟进记录写入失败：${followUpError.message}`, sent: true }, { status: 500 });

    const cadenceDays = coldCadenceDays[customer.priority] ?? 30;
    await supabase.from("customers").update({
      next_follow_up_at: new Date(Date.now() + cadenceDays * 86_400_000).toISOString(),
      stage: customer.stage === "New Lead" ? "Contacted" : customer.stage,
    }).eq("id", customer.id);

    revalidatePath("/email");
    revalidatePath(`/customers/${customer.id}`);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, message: "邮件已发送，并已自动写入客户跟进记录。", id: sent.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "邮件发送失败。" }, { status: 500 });
  }
}
