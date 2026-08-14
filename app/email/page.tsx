import { redirect } from "next/navigation";
import { EmailComposer, type EmailCustomerOption, type EmailReplyContext } from "@/components/email-composer";
import { EmailInbox, type EmailInboxMessage } from "@/components/email-inbox";
import { FollowUpTabs } from "@/components/follow-up-tabs";
import { Header } from "@/components/header";
import { buildEmailCadence } from "@/lib/email-cadence";
import { listCustomerMessages, type GmailMessageSummary } from "@/lib/gmail";
import { getSharedGmailAccount, isEmailAdmin, sharedGmailAddress, sharedGmailConfigured } from "@/lib/shared-gmail";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";
import "./email.css";
import "./email-enhancements.css";
import "../follow-up/follow-up.css";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  google_not_configured: "共享 Google 邮箱尚未完成系统配置。",
  admin_required: "只有邮件管理员可以连接或断开共享邮箱。",
  invalid_oauth_state: "Google 授权校验失败，请重新连接。",
  token_exchange_failed: "Google 授权码交换失败，请重新连接。",
  gmail_profile_failed: "无法读取 Google 邮箱账号信息。",
  wrong_google_account: `请使用 ${sharedGmailAddress()} 完成授权。`,
  missing_refresh_token: "Google 没有返回长期授权，请重新连接并允许邮箱权限。",
  save_account_failed: "邮箱授权成功，但账号信息保存失败。",
  access_denied: "你取消了 Google 邮箱授权。",
};

function extractEmail(value: string) {
  return value.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] || value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
}

function replySubject(subject: string) {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; disconnected?: string; reply?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: customerData }, { count: totalCustomerCount }, { data: followUpData }] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("is_excluded", false)
      .not("contact_email", "is", null)
      .neq("contact_email", "")
      .order("company", { ascending: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_excluded", false),
    supabase.from("follow_ups").select("*").order("happened_at", { ascending: false }),
  ]);
  const customers = (customerData ?? []) as Customer[];
  const followUps = (followUpData ?? []) as FollowUp[];
  const priorityRank: Record<string, number> = { "A+": 0, A: 1, B: 2, C: 3, D: 4 };

  const systemConfigured = sharedGmailConfigured();
  const admin = isEmailAdmin(auth.user.email);
  let account = null;
  let accountError = "";
  let messages: GmailMessageSummary[] = [];
  let mailError = "";
  if (systemConfigured) {
    try {
      const shared = await getSharedGmailAccount();
      account = shared.account;
      if (account) {
        try {
          messages = await listCustomerMessages(shared.supabase, account, customers);
        } catch (error) {
          mailError = error instanceof Error ? error.message : "邮件读取失败。";
        }
      }
    } catch (error) {
      accountError = error instanceof Error ? error.message : "共享邮箱读取失败。";
    }
  }

  const now = new Date();
  const options: EmailCustomerOption[] = customers
    .map((customer) => {
      const cadence = buildEmailCadence(customer, followUps, now);
      return {
        id: customer.id,
        company: customer.company,
        contact_email: customer.contact_email!,
        country: customer.country,
        priority: customer.priority,
        website: customer.website,
        email_sent: cadence.emailSent,
        email_due: cadence.emailDue,
        last_email_at: cadence.lastEmailAt,
        next_email_at: cadence.nextEmailAt,
        cadence_days: cadence.cadenceDays,
        has_replied: cadence.hasReplied,
        overdue_days: cadence.overdueDays,
        timing_status: cadence.timingStatus,
      };
    })
    .sort(
      (left, right) =>
        Number(right.email_due) - Number(left.email_due) ||
        (right.overdue_days ?? -9999) - (left.overdue_days ?? -9999) ||
        (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99) ||
        left.company.localeCompare(right.company),
    );
  const approvedCount = totalCustomerCount ?? customers.length;
  const missingEmailCount = Math.max(approvedCount - customers.length, 0);
  const dueEmailCount = options.filter((item) => item.email_due).length;
  const sender = sharedGmailAddress();
  const replyMessage = params.reply ? messages.find((message) => message.id === params.reply && message.direction === "received") : null;
  const initialReply: EmailReplyContext | null = replyMessage ? {
    customer_id: replyMessage.customerId,
    to: extractEmail(replyMessage.from) || replyMessage.customerEmail,
    subject: replySubject(replyMessage.subject),
    thread_id: replyMessage.threadId,
    message_id: replyMessage.messageId,
  } : null;
  const inboxMessages: EmailInboxMessage[] = messages.map((message) => ({
    id: message.id,
    customerId: message.customerId,
    company: message.company,
    customerEmail: message.customerEmail,
    direction: message.direction,
    subject: message.subject,
    snippet: message.snippet,
    content: message.content,
    from: message.from,
    to: message.to,
    cc: message.cc,
    date: message.date,
    reply: message.direction === "received" ? {
      customer_id: message.customerId,
      to: extractEmail(message.from) || message.customerEmail,
      subject: replySubject(message.subject),
      thread_id: message.threadId,
      message_id: message.messageId,
    } : null,
  }));

  return <div className="shell"><Header/><main className="container emailPage">
    <div className="pageHeader"><div><span className="pageKicker">CUSTOMER FOLLOW-UP · EMAIL</span><h2>客户跟进 · 邮件</h2><p>全员共用一个业务邮箱，支持客户往来邮件、AI 草稿、发送和自动留痕。</p></div><a className="secondaryButton" href="/follow-up">返回跟进总览</a></div>
    <FollowUpTabs active="email"/>

    {params.error && <div className="emailNotice error">{errorMessages[params.error] || `Google 邮箱连接失败：${params.error}`}</div>}
    {params.connected && <div className="emailNotice success">共享 Google 邮箱已连接，全体业务员可以使用。</div>}
    {params.disconnected && <div className="emailNotice">共享 Google 邮箱已断开。</div>}
    {accountError && <div className="emailNotice error">{accountError}</div>}

    <section className="card emailAccountBar">
      <div><span className={account ? "connectionDot connected" : "connectionDot"}/><strong>{account ? `共享邮箱已连接 · ${account.email}` : `共享邮箱待连接 · ${sender}`}</strong><p>{account ? "全体业务员共用此邮箱，发送操作仍记录当前登录人员。" : "管理员完成一次 Google 授权后，全体业务员即可直接使用。"}</p></div>
      {account && admin ? <form action="/api/gmail/disconnect" method="post"><button className="secondaryButton">断开共享邮箱</button></form>
        : account ? <span className="configBadge">全员共用</span>
        : systemConfigured && admin ? <a className="primary" href="/api/gmail/connect">授权共享 Google 邮箱</a>
        : <span className="configBadge">{systemConfigured ? "等待管理员授权" : "等待系统配置"}</span>}
    </section>

    {!account ? <section className="card emailSetup">
      <h3>共享邮箱只需要管理员授权一次</h3>
      <div className="setupSteps"><span>1</span><p><strong>管理员授权</strong><small>使用 {sender} 登录 Google 并允许邮件权限。</small></p><span>2</span><p><strong>全员共用</strong><small>其他业务员不需要连接自己的邮箱。</small></p><span>3</span><p><strong>发送并留痕</strong><small>发送成功后自动新增客户跟进记录和操作人员。</small></p></div>
    </section> : <div className="emailWorkspace">
      <section className="card composePanel">
        <div className="emailPanelHeading"><div><h3>写跟进邮件</h3><p>可先生成草稿，再由业务员确认发送。</p></div></div>
        <div className="emailCustomerStats" aria-label="邮件客户数据说明">
          <div><strong>{approvedCount}</strong><span>当前可见客户</span></div>
          <div><strong>{customers.length}</strong><span>可发邮件客户</span></div>
          <div><strong>{dueEmailCount}</strong><span>当前待发邮件</span></div>
          <div><strong>{missingEmailCount}</strong><span>缺少联系邮箱</span></div>
        </div>
        <EmailComposer customers={options} totalCustomers={approvedCount} initialReply={initialReply}/>
      </section>
      <EmailInbox messages={inboxMessages} mailError={mailError}/>
    </div>}
  </main></div>;
}
