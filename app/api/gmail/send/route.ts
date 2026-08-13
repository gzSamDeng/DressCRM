import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { coldCadenceDays, engagedCadenceDays } from "@/lib/follow-up-priority";
import { buildRawEmail, sendGmailMessage } from "@/lib/gmail";
import { getSharedGmailAccount } from "@/lib/shared-gmail";
import { createClient } from "@/lib/supabase/server";
import { buildCustomerMessagingProfile, outboundCopyIssues } from "@/lib/customer-messaging";
import type { Customer } from "@/types/database";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
    const shared = await getSharedGmailAccount();
    if (!shared.account) return NextResponse.json({ error: "共享 Google 邮箱尚未完成管理员授权。" }, { status: 503 });

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

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("is_excluded", false)
      .single();
    if (customerError || !customerData) return NextResponse.json({ error: "客户线索不存在。" }, { status: 404 });
    const customer = customerData as Customer;
    const copyIssues = outboundCopyIssues(`${subject}\n${body}`, buildCustomerMessagingProfile(customer));
    if (copyIssues.length) {
      return NextResponse.json({
        error: `发送前质检未通过：${copyIssues.join("；")}。请重新生成或修改后再发送。`,
        quality_issues: copyIssues,
      }, { status: 400 });
    }

    const file = formData.get("attachment");
    let attachment: { name: string; type: string; bytes: Buffer } | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "MVP 版本附件请控制在 8MB 以内。" }, { status: 400 });
      attachment = { name: file.name, type: file.type || "application/octet-stream", bytes: Buffer.from(await file.arrayBuffer()) };
    }

    const raw = buildRawEmail({ from: shared.account.email, to, cc: ccAddresses.join(", "), subject, body, attachment });
    const sent = await sendGmailMessage(shared.supabase, shared.account, raw);
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      customer_id: customer.id,
      channel: "Email",
      summary: `发送邮件：${subject}（收件人：${to}）`,
      outcome: "无回复",
      next_action: "等待客户回复",
      happened_at: new Date().toISOString(),
      created_by: auth.user.id,
    });
    if (followUpError) return NextResponse.json({ error: `邮件已发送，但跟进记录写入失败：${followUpError.message}`, sent: true }, { status: 500 });

    const { data: replyHistory } = await supabase
      .from("follow_ups")
      .select("outcome")
      .eq("customer_id", customer.id)
      .in("outcome", ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"])
      .limit(1);
    const cadenceDays = (replyHistory?.length ? engagedCadenceDays : coldCadenceDays)[customer.priority] ?? 30;
    await supabase.from("customers").update({
      next_follow_up_at: new Date(Date.now() + cadenceDays * 86_400_000).toISOString(),
      stage: customer.stage === "New Lead" ? "Contacted" : customer.stage,
    }).eq("id", customer.id);

    revalidatePath("/email");
    revalidatePath("/follow-up");
    revalidatePath(`/customers/${customer.id}`);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, message: "邮件已发送，并已自动写入客户跟进记录。", id: sent.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "邮件发送失败。" }, { status: 500 });
  }
}
