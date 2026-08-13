"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_CC = "liqingyan777@gmail.com, samteng188@gmail.com";

export type EmailCustomerOption = {
  id: string;
  company: string;
  contact_email: string;
  country: string | null;
  priority: string;
  website: string | null;
  email_sent: boolean;
  email_due: boolean;
  last_email_at: string | null;
  next_email_at: string | null;
  cadence_days: number;
  has_replied: boolean;
  overdue_days: number | null;
  timing_status: "first_contact" | "due" | "today" | "upcoming" | "unknown";
};

export type EmailReplyContext = {
  customer_id: string;
  to: string;
  subject: string;
  thread_id: string;
  message_id: string;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—";
}

function timingCopy(customer: EmailCustomerOption) {
  if (customer.timing_status === "first_contact") return "从未发送过邮件，建议现在进行首次联系";
  if (customer.timing_status === "unknown") return "历史记录显示已发送，但缺少发送日期，请人工确认后决定是否再次联系";
  if (customer.timing_status === "due") return `已超过建议发送时间 ${customer.overdue_days} 天`;
  if (customer.timing_status === "today") return "今天达到建议发送时间";
  return `距离建议发送时间还有 ${Math.abs(customer.overdue_days ?? 0)} 天`;
}

export function EmailComposer({ customers, totalCustomers, initialReply = null }: {
  customers: EmailCustomerOption[];
  totalCustomers: number;
  initialReply?: EmailReplyContext | null;
}) {
  const router = useRouter();
  const firstDueCustomer = customers.find((item) => item.email_due);
  const [customerId, setCustomerId] = useState(initialReply?.customer_id || firstDueCustomer?.id || "");
  const [to, setTo] = useState(initialReply?.to || firstDueCustomer?.contact_email || "");
  const [cc, setCc] = useState(DEFAULT_CC);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNotDueCustomers, setShowNotDueCustomers] = useState(Boolean(initialReply));
  const [justSentAt, setJustSentAt] = useState<Record<string, string>>({});
  const [purpose, setPurpose] = useState(initialReply ? "回复客户最新来信中的具体问题，并延续当前沟通。" : "");
  const [subject, setSubject] = useState(initialReply?.subject || "");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [replyContext, setReplyContext] = useState<EmailReplyContext | null>(initialReply);
  const customer = useMemo(() => customers.find((item) => item.id === customerId), [customerId, customers]);
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    return customers.filter((item) => {
      const matchesDueStatus = showNotDueCustomers || (item.email_due && !justSentAt[item.id]);
      const matchesPriority = !priorityFilter || item.priority === priorityFilter;
      const matchesSearch = !keyword || [item.company, item.contact_email, item.country ?? "", item.website ?? ""]
        .some((value) => value.toLowerCase().includes(keyword));
      return matchesDueStatus && matchesPriority && matchesSearch;
    });
  }, [customerSearch, customers, justSentAt, priorityFilter, showNotDueCustomers]);

  useEffect(() => {
    if (filteredCustomers.some((item) => item.id === customerId)) return;
    const nextCustomer = filteredCustomers[0];
    setCustomerId(nextCustomer?.id || "");
    setTo(nextCustomer?.contact_email || "");
  }, [customerId, filteredCustomers]);

  function selectCustomer(id: string) {
    const selected = customers.find((item) => item.id === id);
    setCustomerId(id);
    setTo(selected?.contact_email || "");
    setReplyContext(null);
    setStatus(null);
  }

  function updateFilters(nextPriority: string, nextSearch: string) {
    setPriorityFilter(nextPriority);
    setCustomerSearch(nextSearch);
  }

  async function generateDraft() {
    if (!customerId) return setStatus({ ok: false, message: "请先选择客户。" });
    setGenerating(true);
    setStatus(null);
    try {
      const response = await fetch("/api/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, purpose, reply_message_id: replyContext?.message_id }),
      });
      const data = await response.json() as {
        subject?: string;
        body?: string;
        source?: "ai" | "template";
        context?: { follow_ups: number; email_messages: number; signals: number };
        error?: string;
      };
      if (!response.ok || !data.subject || !data.body) throw new Error(data.error || "草稿生成失败。");
      setSubject(replyContext?.subject || data.subject);
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
      setJustSentAt((current) => ({ ...current, [customerId]: new Date().toISOString() }));
      setSubject("");
      setBody("");
      setPurpose("");
      setReplyContext(null);
      form.reset();
      setCc(DEFAULT_CC);
      router.refresh();
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : "邮件发送失败。" });
    } finally {
      setSending(false);
    }
  }

  if (!customers.length) {
    return totalCustomers === 0
      ? <div className="emailEmpty"><strong>当前账号尚未分配客户</strong><p>请让老板或业务总监在“客户线索”的负责人栏中分配客户；分配后即可使用共享邮箱发送邮件。</p></div>
      : <div className="emailEmpty"><strong>负责的客户还没有可用邮箱</strong><p>请先在“客户线索”中为客户补充联系邮箱。</p></div>;
  }

  return <form className="emailComposeForm" onSubmit={send} id="email-composer">
    {replyContext && <div className="emailReplyMode">
      <div><strong>正在回复客户来信</strong><span>邮件会发送到原 Gmail 会话中，而不是新建独立邮件。</span></div>
      <button type="button" onClick={() => { setReplyContext(null); setSubject(""); setPurpose(""); }}>取消回复</button>
    </div>}
    <input type="hidden" name="thread_id" value={replyContext?.thread_id || ""}/>
    <input type="hidden" name="reply_message_id" value={replyContext?.message_id || ""}/>
    <div className="composeRow">
      <label>客户等级
        <select
          value={priorityFilter}
          onChange={(event) => updateFilters(event.target.value, customerSearch)}
        >
          <option value="">全部等级</option>
          {["A+", "A", "B", "C", "D"].map((priority) => <option key={priority} value={priority}>{priority} 级</option>)}
        </select>
      </label>
      <label>搜索客户
        <input
          value={customerSearch}
          onChange={(event) => updateFilters(priorityFilter, event.target.value)}
          placeholder="输入公司、邮箱或国家"
        />
      </label>
    </div>
    <div className="customerFilterLine">
      <p className="customerFilterSummary">当前显示 {filteredCustomers.length} / {customers.length} 位已填写邮箱的客户</p>
      <label className="emailSentToggle">
        <input type="checkbox" checked={showNotDueCustomers} onChange={(event) => setShowNotDueCustomers(event.target.checked)}/>
        显示尚未到期及日期不明的客户（{customers.filter((item) => !item.email_due).length}）
      </label>
    </div>
    <div className="composeRow">
      <label>选择客户
        <select name="customer_id" value={customerId} onChange={(event) => selectCustomer(event.target.value)} required>
          {!filteredCustomers.length && <option value="">当前没有到期客户，可勾选显示尚未到期客户</option>}
          {filteredCustomers.map((item) => <option key={item.id} value={item.id}>{item.priority} · {item.company} · {item.contact_email}{item.email_due ? " · 待发送" : ""}</option>)}
        </select>
      </label>
      <label>收件人（可人工修改）<input name="to" type="email" value={to} onChange={(event) => setTo(event.target.value)} required/><small>修改仅用于本次发送，不会覆盖客户线索中的邮箱。</small></label>
    </div>
    {customer && (() => {
      const sentNow = justSentAt[customer.id];
      const nextAfterSend = sentNow ? new Date(new Date(sentNow).getTime() + customer.cadence_days * 86_400_000).toISOString() : null;
      return <div className={`emailCadenceNotice ${customer.email_due && !sentNow ? "due" : "upcoming"}`}>
      <div><span>上次发送</span><strong>{sentNow ? formatDate(sentNow) : customer.email_sent ? formatDate(customer.last_email_at) : "尚未发送"}</strong></div>
      <div><span>建议下次发送</span><strong>{nextAfterSend ? formatDate(nextAfterSend) : customer.next_email_at ? formatDate(customer.next_email_at) : customer.email_sent ? "日期待确认" : "现在"}</strong></div>
      <div><span>系统周期</span><strong>{customer.cadence_days} 天 · {customer.has_replied ? "客户曾回复" : "客户未回复"}</strong></div>
      <p>{sentNow ? `本次邮件已发送，下次建议在 ${formatDate(nextAfterSend)} 联系` : timingCopy(customer)}</p>
    </div>;
    })()}
    {customer?.website && <div className="selectedCustomerWebsite"><span>客户网站</span><a href={customer.website.match(/^https?:\/\//i) ? customer.website : `https://${customer.website}`} target="_blank" rel="noreferrer">{customer.website}</a><small>发送前可点击官网，再次确认客户与产品是否匹配。</small></div>}
    <label>抄送 CC（可选，多个邮箱用逗号分隔）<input name="cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@example.com"/></label>
    <div className="draftAssistant">
      <label>这封邮件想沟通什么（可选）
        <input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：询问秋季采购计划、推荐新款目录"/>
        <small>系统会自动综合客户背景、CRM 跟进记录、历史往来邮件和商业信号，并在末尾加入固定签名。</small>
      </label>
      <button className="secondaryButton" type="button" onClick={generateDraft} disabled={generating || !customerId}>{generating ? "正在生成…" : "生成邮件草稿"}</button>
    </div>
    <label>主题<input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required/></label>
    <label>正文<textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} required/></label>
    <label className="attachmentField">附件（可选，MVP 版单个文件，不超过 8MB）<input name="attachment" type="file"/></label>
    {status && <p className={status.ok ? "emailStatus success" : "emailStatus error"} role="status">{status.message}</p>}
    <div className="composeActions"><span>发送成功后自动写入该客户的跟进记录。</span><button className="primary" disabled={sending || !customerId}>{sending ? "正在发送…" : "发送邮件"}</button></div>
  </form>;
}
