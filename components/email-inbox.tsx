"use client";

import { useActionState, useEffect, useRef } from "react";
import { addManualFollowUp, type FollowUpActionState } from "@/app/actions";
import type { EmailReplyContext } from "@/components/email-composer";

const initialFollowUpState: FollowUpActionState = { ok: false, message: "" };

export type EmailInboxMessage = {
  id: string;
  customerId: string;
  company: string;
  customerEmail: string;
  direction: "received" | "sent";
  subject: string;
  snippet: string;
  content: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  reply: EmailReplyContext | null;
};

function EmailOutcomeForm({ message }: { message: EmailInboxMessage }) {
  const [state, formAction, pending] = useActionState(addManualFollowUp, initialFollowUpState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return <details className="mailOutcome">
    <summary>记录跟进结果或备注</summary>
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="customer_id" value={message.customerId}/>
      <input type="hidden" name="channel" value="Email"/>
      <input type="hidden" name="happened_at" value={message.date}/>
      <label>跟进结果
        <select name="outcome" defaultValue="暂无采购计划">
          <option>已回复</option><option>有兴趣</option><option>要求报价</option><option>要求样品</option>
          <option>采购计划明确</option><option>暂无采购计划</option><option>明确拒绝</option>
          <option>退订</option><option>联系方式无效</option><option>无回复</option>
        </select>
      </label>
      <label>备注
        <textarea name="summary" defaultValue={`邮件沟通：${message.subject}`} placeholder="例如：客户回复暂时不需要，建议三个月后再联系。" required/>
      </label>
      <label>下一步（可选）<input name="next_action" placeholder="例如：三个月后发送新系列"/></label>
      <label>下次跟进日期（可选）<input name="next_follow_up_at" type="date"/></label>
      {state.message && <p className={state.ok ? "formSuccess" : "formError"} role="status">{state.message}</p>}
      <button className="primary" disabled={pending}>{pending ? "正在保存…" : "保存跟进结果"}</button>
    </form>
  </details>;
}

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
      <strong>{message.subject}</strong><a href={`/customers/${message.customerId}`}>{message.company} · {message.customerEmail}</a><p className="mailSnippet">{message.snippet || "（无预览内容）"}</p>
      <details className="mailDetails">
        <summary>查看完整邮件</summary>
        <div className="mailHeaders"><span><b>发件人：</b>{message.from || "—"}</span><span><b>收件人：</b>{message.to || "—"}</span>{message.cc && <span><b>抄送：</b>{message.cc}</span>}</div>
        <pre>{message.content || message.snippet || "（邮件正文为空）"}</pre>
      </details>
      {message.reply && <button className="mailReplyButton" type="button" onClick={() => startReply(message.reply!)}>在此页面回复</button>}
      <EmailOutcomeForm message={message}/>
    </article>)}{!messages.length && !mailError && <div className="emailEmpty"><strong>暂时没有匹配邮件</strong><p>系统只检索客户线索中已填写联系邮箱的企业。</p></div>}</div>
  </section>;
}
