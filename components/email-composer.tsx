"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type EmailCustomerOption = {
  id: string;
  company: string;
  contact_email: string;
  country: string | null;
  priority: string;
};

export function EmailComposer({ customers }: { customers: EmailCustomerOption[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [to, setTo] = useState(customers[0]?.contact_email || "");
  const [cc, setCc] = useState("");
  const [purpose, setPurpose] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const customer = useMemo(() => customers.find((item) => item.id === customerId), [customerId, customers]);

  function selectCustomer(id: string) {
    const selected = customers.find((item) => item.id === id);
    setCustomerId(id);
    setTo(selected?.contact_email || "");
    setStatus(null);
  }

  async function generateDraft() {
    if (!customerId) return setStatus({ ok: false, message: "请先选择客户。" });
    setGenerating(true);
    setStatus(null);
    try {
      const response = await fetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, purpose }),
      });
      const data = await response.json() as {
        subject?: string;
        body?: string;
        source?: "ai" | "template";
        context?: { follow_ups: number; email_messages: number; signals: number };
        error?: string;
      };
      if (!response.ok || !data.subject || !data.body) throw new Error(data.error || "草稿生成失败。");
      setSubject(data.subject);
      setBody(data.body);
      const context = data.context;
      setStatus({
        ok: true,
        message: data.source === "ai" && context
          ? `AI 已综合客户背景、${context.follow_ups} 条跟进记录、${context.email_messages} 封往来邮件和 ${context.signals} 条商业信号生成草稿，请确认后发送。`
          : "已根据客户背景和可用的历史沟通记录生成草稿，请确认后发送。",
      });
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : "草稿生成失败。" });
    } finally {
      setGenerating(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/gmail/send", { method: "POST", body: new FormData(form) });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "邮件发送失败。");
      setStatus({ ok: true, message: data.message || "邮件已发送。" });
      setSubject("");
      setBody("");
      setPurpose("");
      form.reset();
      setTo(customer?.contact_email || "");
      setCc("");
      router.refresh();
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : "邮件发送失败。" });
    } finally {
      setSending(false);
    }
  }

  if (!customers.length) {
    return <div className="emailEmpty"><strong>还没有可发邮件的客户</strong><p>请先在“客户线索”中为客户补充联系邮箱。</p></div>;
  }

  return <form className="emailComposeForm" onSubmit={send}>
    <div className="composeRow">
      <label>选择客户
        <select name="customer_id" value={customerId} onChange={(event) => selectCustomer(event.target.value)} required>
          {customers.map((item) => <option key={item.id} value={item.id}>{item.priority} · {item.company} · {item.contact_email}</option>)}
        </select>
      </label>
      <label>收件人<input name="to" type="email" value={to} readOnly required/></label>
    </div>
    <label>抄送 CC（可选，多个邮箱用逗号分隔）<input name="cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@example.com"/></label>
    <div className="draftAssistant">
      <label>这封邮件想沟通什么（可选）
        <input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：询问秋季采购计划、推荐新款目录"/>
        <small>系统会自动综合客户背景、CRM 跟进记录、历史往来邮件和商业信号，并在末尾加入固定签名。</small>
      </label>
      <button className="secondaryButton" type="button" onClick={generateDraft} disabled={generating}>{generating ? "正在生成…" : "生成邮件草稿"}</button>
    </div>
    <label>主题<input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required/></label>
    <label>正文<textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} required/></label>
    <label className="attachmentField">附件（可选，MVP 版单个文件，不超过 8MB）<input name="attachment" type="file"/></label>
    {status && <p className={status.ok ? "emailStatus success" : "emailStatus error"} role="status">{status.message}</p>}
    <div className="composeActions"><span>发送成功后自动写入该客户的跟进记录。</span><button className="primary" disabled={sending}>{sending ? "正在发送…" : "发送邮件"}</button></div>
  </form>;
}
