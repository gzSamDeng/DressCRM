import { redirect } from "next/navigation";
import { EmailComposer, type EmailCustomerOption } from "@/components/email-composer";
import { Header } from "@/components/header";
import { getGmailAccount, gmailConfigured, listCustomerMessages, type GmailMessageSummary } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";
import "./email.css";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  google_not_configured: "系统还没有配置 Google OAuth，请先完成管理员配置。",
  invalid_oauth_state: "Google 授权校验失败，请重新连接。",
  token_exchange_failed: "Google 授权码交换失败，请重新连接。",
  gmail_profile_failed: "无法读取 Google 邮箱账号信息。",
  missing_refresh_token: "Google 没有返回长期授权，请重新连接并允许邮箱权限。",
  save_account_failed: "邮箱授权成功，但账号信息保存失败。",
  access_denied: "你取消了 Google 邮箱授权。",
};

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string; disconnected?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: customerData } = await supabase
    .from("customers")
    .select("*")
    .not("contact_email", "is", null)
    .neq("contact_email", "")
    .order("priority", { ascending: true })
    .order("company", { ascending: true });
  const customers = (customerData ?? []) as Customer[];

  let account = null;
  let accountError = "";
  try {
    account = await getGmailAccount(supabase, auth.user.id);
  } catch (error) {
    accountError = error instanceof Error ? error.message : "邮箱账号读取失败。";
  }

  let messages: GmailMessageSummary[] = [];
  let mailError = "";
  if (account) {
    try {
      messages = await listCustomerMessages(supabase, account, customers);
    } catch (error) {
      mailError = error instanceof Error ? error.message : "邮件读取失败。";
    }
  }

  const options: EmailCustomerOption[] = customers.map((customer) => ({
    id: customer.id,
    company: customer.company,
    contact_email: customer.contact_email!,
    country: customer.country,
    priority: customer.priority,
  }));
  const configured = gmailConfigured();

  return <div className="shell"><Header/><main className="container emailPage">
    <div className="pageHeader"><div><span className="pageKicker">EMAIL FOLLOW-UP</span><h2>邮件跟进</h2><p>只保留外贸跟进最需要的功能：客户往来邮件、草稿生成、发送和自动留痕。</p></div></div>

    {params.error && <div className="emailNotice error">{errorMessages[params.error] || `Google 邮箱连接失败：${params.error}`}</div>}
    {params.connected && <div className="emailNotice success">Google 邮箱已连接，可以读取客户往来邮件并发送跟进。</div>}
    {params.disconnected && <div className="emailNotice">Google 邮箱已断开。</div>}
    {accountError && <div className="emailNotice error">数据库尚未完成邮件模块迁移：{accountError}</div>}

    <section className="card emailAccountBar">
      <div><span className={account ? "connectionDot connected" : "connectionDot"}/><strong>{account ? `已连接 ${account.email}` : "尚未连接 Google 邮箱"}</strong><p>{account ? "页面只显示客户线索中已有邮箱的往来邮件。" : "每位业务员连接自己的 Google 邮箱，授权彼此独立。"}</p></div>
      {account ? <form action="/api/gmail/disconnect" method="post"><button className="secondaryButton">断开连接</button></form>
        : configured ? <a className="primary" href="/api/gmail/connect">连接 Google 邮箱</a>
        : <span className="configBadge">等待管理员配置</span>}
    </section>

    {!account ? <section className="card emailSetup">
      <h3>启用邮件 MVP 只需要一次 Google 授权</h3>
      <div className="setupSteps"><span>1</span><p><strong>连接邮箱</strong><small>允许系统读取和发送 Gmail 邮件。</small></p><span>2</span><p><strong>匹配客户</strong><small>仅显示客户线索中已有邮箱的往来记录。</small></p><span>3</span><p><strong>发送并留痕</strong><small>邮件发送成功后自动新增客户跟进记录。</small></p></div>
    </section> : <div className="emailWorkspace">
      <section className="card composePanel"><div className="emailPanelHeading"><div><h3>写跟进邮件</h3><p>可先生成草稿，再由业务员确认发送。</p></div></div><EmailComposer customers={options}/></section>
      <section className="card inboxPanel"><div className="emailPanelHeading"><div><h3>客户往来邮件</h3><p>最近两年内最多显示 30 封匹配邮件。</p></div><span>{messages.length} 封</span></div>
        {mailError && <div className="emailNotice error">{mailError}</div>}
        <div className="mailList">{messages.map((message) => <article className="mailItem" key={message.id}>
          <div className="mailMeta"><span className={message.direction === "received" ? "mailDirection received" : "mailDirection sent"}>{message.direction === "received" ? "客户来信" : "已发送"}</span><time>{new Date(message.date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></div>
          <strong>{message.subject}</strong><a href={`/customers/${message.customerId}`}>{message.company} · {message.customerEmail}</a><p>{message.snippet || "（无预览内容）"}</p>
        </article>)}{!messages.length && !mailError && <div className="emailEmpty"><strong>暂时没有匹配邮件</strong><p>系统只检索客户线索中已填写联系邮箱的企业。</p></div>}</div>
      </section>
    </div>}
  </main></div>;
}
