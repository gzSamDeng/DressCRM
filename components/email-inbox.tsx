"use client";

import type { EmailReplyContext } from "@/components/email-composer";

export type EmailInboxMessage = {
  id: string;
  customerId: string;
  company: string;
  customerEmail: string;
  direction: "received" | "sent";
  subject: string;
  snippet: string;
  date: string;
  reply: EmailReplyContext | null;
};

export function EmailInbox({ messages, mailError }: { messages: EmailInboxMessage[]; mailError: string }) {
  function startReply(reply: EmailReplyContext) {
    window.dispatchEvent(new CustomEvent<EmailReplyContext>("dresscrm:email-reply", { detail: reply }));
    window.setTimeout(() => document.getElementById("email-composer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return <section className="card inboxPanel">
    <div className="emailPanelHeading"><div><h3>客户往来邮件</h3><p>最近两年内最多显示 30 封匹配邮件。</p></div><span>{messages.length} 封</span></div>
    {mailError && <div className="emailNotice error">{mailError}</div>}
    <div className="mailList">{messages.map((message) => <article className="mailItem" key={message.id}>
      <div className="mailMeta"><span className={message.direction === "received" ? "mailDirection received" : "mailDirection sent"}>{message.direction === "received" ? "客户来信" : "已发送"}</span><time>{new Date(message.date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></div>
      <strong>{message.subject}</strong><a href={`/customers/${message.customerId}`}>{message.company} · {message.customerEmail}</a><p>{message.snippet || "（无预览内容）"}</p>
      {message.reply && <button className="mailReplyButton" type="button" onClick={() => startReply(message.reply!)}>在此页面回复</button>}
    </article>)}{!messages.length && !mailError && <div className="emailEmpty"><strong>暂时没有匹配邮件</strong><p>系统只检索客户线索中已填写联系邮箱的企业。</p></div>}</div>
  </section>;
}
