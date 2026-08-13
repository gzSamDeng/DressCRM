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
};

export function EmailComposer({ customers, totalCustomers }: { customers: EmailCustomerOption[]; totalCustomers: number }) {
  const router = useRouter();
  const firstUnsentCustomer = customers.find((item) => !item.email_sent);
  const [customerId, setCustomerId] = useState(firstUnsentCustomer?.id || "");
  const [to, setTo] = useState(firstUnsentCustomer?.contact_email || "");
  const [cc, setCc] = useState(DEFAULT_CC);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showSentCustomers, setShowSentCustomers] = useState(false);
  const [sentCustomerIds, setSentCustomerIds] = useState(() => new Set(customers.filter((item) => item.email_sent).map((item) => item.id)));
  const [purpose, setPurpose] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const customer = useMemo(() => customers.find((item) => item.id === customerId), [customerId, customers]);
  const filteredCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase();
    return customers.filter((item) => {
      const matchesSentStatus = showSentCustomers || !sentCustomerIds.has(item.id);
      const matchesPriority = !priorityFilter || item.priority === priorityFilter;
      const matchesSearch = !keyword || [item.company, item.contact_email, item.country ?? "", item.website ?? ""]
        .some((value) => value.toLowerCase().includes(keyword));
      return matchesSentStatus && matchesPriority && matchesSearch;
    });
  }, [customerSearch, customers, priorityFilter, sentCustomerIds, showSentCustomers]);

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
      const nextSentCustomerIds = new Set(sentCustomerIds);
      nextSentCustomerIds.add(customerId);
      setSentCustomerIds(nextSentCustomerIds);
      setSubject("");
      setBody("");
      setPurpose("");
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

  return <form className="emailComposeForm" onSubmit={send}>
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
        <input type="checkbox" checked={showSentCustomers} onChange={(event) => setShowSentCustomers(event.target.checked)}/>
        显示已发过邮件的客户（{sentCustomerIds.size}）
      </label>
    </div>
    <div className="composeRow">
      <label>选择客户
        <select name="customer_id" value={customerId} onChange={(event) => selectCustomer(event.target.value)} required>
          {!filteredCustomers.length && <option value="">没有待首次发送的客户，可勾选显示已发客户</option>}
          {filteredCustomers.map((item) => <option key={item.id} value={item.id}>{item.priority} · {item.company} · {item.contact_email}</option>)}
        </select>
      </label>
      <label>收件人（可人工修改）<input name="to" type="email" value={to} onChange={(event) => setTo(event.target.value)} required/><small>修改仅用于本次发送，不会覆盖客户线索中的邮箱。</small></label>
    </div>
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
