"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FollowUpCustomerOption } from "@/components/manual-follow-up-workspace";
import type { WhatsAppMessage } from "@/types/database";

type WhatsAppTemplate = { name: string; language: string; category?: string; status?: string };

export function WhatsAppWorkspace({
  customers,
  messages,
  configured,
  displayNumber,
  webhookUrl,
  openWindowCustomerIds,
  initialCustomerId,
}: {
  customers: FollowUpCustomerOption[];
  messages: WhatsAppMessage[];
  configured: boolean;
  displayNumber: string;
  webhookUrl: string;
  openWindowCustomerIds: string[];
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const defaultCustomerId = customers.some((item) => item.id === initialCustomerId)
    ? initialCustomerId!
    : customers.find((item) => item.whatsapp)?.id || "";
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"text" | "template">(
    openWindowCustomerIds.includes(defaultCustomerId) ? "text" : "template",
  );
  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [templateParameters, setTemplateParameters] = useState("");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const availableCustomers = useMemo(() => customers.filter((item) => item.whatsapp), [customers]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return availableCustomers.filter((item) =>
      (!priority || item.priority === priority)
      && (!keyword || [item.company, item.country || "", item.whatsapp || ""].some((value) => value.toLowerCase().includes(keyword))),
    );
  }, [availableCustomers, priority, search]);
  const customer = availableCustomers.find((item) => item.id === customerId);
  const conversation = messages.filter((item) => item.customer_id === customerId).slice().reverse();
  const serviceWindowOpen = openWindowCustomerIds.includes(customerId);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    fetch("/api/whatsapp/templates")
      .then(async (response) => {
        const data = await response.json() as { templates?: WhatsAppTemplate[]; error?: string };
        if (!response.ok) throw new Error(data.error || "读取模板失败。");
        if (!active) return;
        setTemplates(data.templates || []);
        const first = data.templates?.[0];
        if (first) { setTemplateName(first.name); setTemplateLanguage(first.language); }
      })
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : "读取模板失败。"); });
    return () => { active = false; };
  }, [configured]);

  async function generateDraft() {
    setStatus("AI 正在结合客户背景和历史沟通生成英文消息…");
    const response = await fetch("/api/follow-up/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, channel: "WhatsApp", purpose }),
    });
    const data = await response.json() as { draft?: string; error?: string };
    if (data.draft) {
      setText(data.draft);
      if (serviceWindowOpen) {
        setMode("text");
        setStatus("AI 草稿已生成，请确认后发送。");
      } else {
        setMode("template");
        setStatus("AI 已生成参考文案；该客户不在 24 小时窗口内，请使用 Meta 已审核模板发送。");
      }
    }
    else setStatus(data.error || "草稿生成失败。");
  }

  async function sendMessage() {
    if (!customerId || sending) return;
    setSending(true);
    setStatus("正在通过 Meta WhatsApp Cloud API 发送…");
    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          mode,
          text,
          template_name: templateName,
          template_language: templateLanguage,
          template_parameters: templateParameters.split("\n"),
        }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "发送失败。");
      setStatus(data.message || "消息已发送。");
      if (mode === "text") setText("");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发送失败。");
    } finally {
      setSending(false);
    }
  }

  return <div className="whatsappWorkspace">
    <section className="card whatsappComposer">
      <div className="panelHeading"><div><h3>WhatsApp Business</h3><p>通过 Meta 官方 Cloud API 发送，所有收发消息和送达状态自动保存。</p></div><span className={configured ? "connectedBadge" : "manualBadge"}>{configured ? `已连接${displayNumber ? ` · ${displayNumber}` : ""}` : "等待管理员配置"}</span></div>
      {!configured && <div className="integrationSetup"><strong>管理员需要在 Meta 和 Vercel 完成一次配置</strong><p>Webhook 回调地址：</p><code>{webhookUrl}</code><p>Vercel 环境变量：</p><code>WHATSAPP_ACCESS_TOKEN</code><code>WHATSAPP_PHONE_NUMBER_ID</code><code>WHATSAPP_BUSINESS_ACCOUNT_ID</code><code>WHATSAPP_VERIFY_TOKEN</code><code>META_APP_SECRET</code><small>Access Token 和 App Secret 只保存在 Vercel，不写入浏览器或数据库。</small></div>}
      <div className="filterGrid"><label>客户等级<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">全部等级</option>{["A+","A","B","C","D"].map((item) => <option key={item}>{item}</option>)}</select></label><label>搜索客户<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="公司、国家或 WhatsApp 号码"/></label></div>
      <label>选择客户<select value={customerId} onChange={(event) => { const id = event.target.value; setCustomerId(id); if (!openWindowCustomerIds.includes(id)) setMode("template"); }}>{filtered.map((item) => <option key={item.id} value={item.id}>{item.priority} · {item.company} · {item.whatsapp}</option>)}</select></label>
      <div className="selectedCustomer"><div><span>公司</span><strong>{customer?.company || "未选择"}</strong></div><div><span>号码</span><strong>{customer?.whatsapp || "无号码"}</strong></div><div><span>等级</span><strong>{customer?.priority || "-"}</strong></div><div><span>已同步消息</span><strong>{conversation.length}</strong></div></div>
      <label>本次沟通目标（可选）<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：介绍新品、确认采购计划"/></label>
      <button type="button" className="secondaryButton fullButton" onClick={generateDraft} disabled={!customerId}>生成 AI 英文消息</button>
      <div className="messageMode"><button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")} disabled={!serviceWindowOpen}>24 小时内自由消息 {serviceWindowOpen ? "· 可用" : "· 未开放"}</button><button type="button" className={mode === "template" ? "active" : ""} onClick={() => setMode("template")}>已审核模板</button></div>
      {mode === "text" ? <label>消息内容<textarea className="channelDraft" value={text} onChange={(event) => setText(event.target.value)} placeholder="客户最近 24 小时内发过消息时，可发送自由文本。"/></label>
        : <div className="templateFields"><label>Meta 已审核模板{templates.length ? <select value={`${templateName}::${templateLanguage}`} onChange={(event) => { const [name, language] = event.target.value.split("::"); setTemplateName(name); setTemplateLanguage(language); }}>{templates.map((template) => <option key={`${template.name}-${template.language}`} value={`${template.name}::${template.language}`}>{template.name} · {template.language}{template.category ? ` · ${template.category}` : ""}</option>)}</select> : <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：new_collection_intro"/>}</label><label>语言代码<input value={templateLanguage} onChange={(event) => setTemplateLanguage(event.target.value)} placeholder="en_US"/></label><label className="templateParameters">正文变量（可选，每行一个）<textarea value={templateParameters} onChange={(event) => setTemplateParameters(event.target.value)} placeholder="Sam\nEvening Dress Collection"/></label></div>}
      <p className="policyHint">主动联系陌生客户或超过 24 小时未互动时，必须使用 Meta 审核通过的模板；客户回复后 24 小时内才能发送自由文本。</p>
      <button type="button" className="primary fullButton" onClick={sendMessage} disabled={!configured || !customerId || sending}>{sending ? "正在发送…" : "发送 WhatsApp 消息"}</button>
      {status && <p className="channelStatus" role="status">{status}</p>}
    </section>
    <section className="card whatsappConversation">
      <div className="panelHeading"><div><h3>客户 WhatsApp 往来</h3><p>Webhook 自动同步客户来信、业务员发送内容和送达状态。</p></div><span>{conversation.length} 条</span></div>
      <div className="messageThread">{conversation.map((message) => <article key={message.id} className={message.direction === "outbound" ? "outbound" : "inbound"}><div><strong>{message.direction === "outbound" ? "我方" : message.contact_name || customer?.company || "客户"}</strong><span>{message.status}</span></div><p>{message.text_body || `[${message.message_type}]`}</p><small>{new Date(message.happened_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</small>{message.error_text && <em>{message.error_text}</em>}</article>)}{!conversation.length && <div className="followUpEmpty"><strong>暂无同步消息</strong><p>完成 Meta Webhook 配置后，客户来信会自动出现在这里。</p></div>}</div>
    </section>
  </div>;
}
