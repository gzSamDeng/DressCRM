"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addManualFollowUp, type FollowUpActionState } from "@/app/actions";
import type { ManualChannel } from "@/lib/channel-draft";

export type FollowUpCustomerOption = {
  id: string;
  company: string;
  priority: string;
  country: string | null;
  customer_type: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  website: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
};

const initialState: FollowUpActionState = { ok: false, message: "" };
const channelMeta: Record<ManualChannel, { title: string; description: string; action: string; draftLabel: string }> = {
  WhatsApp: {
    title: "WhatsApp 人工跟进",
    description: "AI 生成英文短消息，业务员确认后打开 WhatsApp 发送，再将结果保存到系统。",
    action: "打开 WhatsApp",
    draftLabel: "WhatsApp 消息建议",
  },
  Telegram: {
    title: "Telegram 人工跟进",
    description: "Telegram 不做陌生客户自动发送；复制 AI 建议后由业务员人工联系并留痕。",
    action: "打开 Telegram",
    draftLabel: "Telegram 消息建议",
  },
  LinkedIn: {
    title: "LinkedIn 人工跟进",
    description: "系统只提供 AI 文案、快捷打开和人工留痕，不执行自动私信。",
    action: "打开 LinkedIn",
    draftLabel: "LinkedIn 消息建议",
  },
  Phone: {
    title: "电话跟进",
    description: "当前先提供 AI 通话提纲和人工通话记录；真实浏览器拨号将在电话供应商接入后启用。",
    action: "尝试拨号",
    draftLabel: "AI 通话提纲",
  },
};

function contactUrl(channel: ManualChannel, customer: FollowUpCustomerOption | undefined, draft: string) {
  if (channel === "WhatsApp") {
    const digits = (customer?.whatsapp || "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(draft)}` : "https://web.whatsapp.com/";
  }
  if (channel === "Telegram") return "https://web.telegram.org/k/";
  if (channel === "LinkedIn") {
    const match = customer?.notes?.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s，。]+/i);
    return match?.[0] || "https://www.linkedin.com/";
  }
  const digits = (customer?.whatsapp || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function ManualFollowUpWorkspace({
  channel,
  customers,
  initialCustomerId,
}: {
  channel: ManualChannel;
  customers: FollowUpCustomerOption[];
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addManualFollowUp, initialState);
  const [customerId, setCustomerId] = useState(
    customers.some((item) => item.id === initialCustomerId) ? initialCustomerId! : customers[0]?.id || "",
  );
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [purpose, setPurpose] = useState("");
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const meta = channelMeta[channel];
  const customer = customers.find((item) => item.id === customerId);

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((item) =>
      (!priority || item.priority === priority)
      && (!keyword || [item.company, item.country || "", item.contact_email || "", item.whatsapp || ""]
        .some((value) => value.toLowerCase().includes(keyword)))
    );
  }, [customers, priority, search]);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  function updateFilter(nextPriority: string, nextSearch: string) {
    setPriority(nextPriority);
    setSearch(nextSearch);
    const keyword = nextSearch.trim().toLowerCase();
    const next = customers.filter((item) =>
      (!nextPriority || item.priority === nextPriority)
      && (!keyword || [item.company, item.country || "", item.contact_email || "", item.whatsapp || ""]
        .some((value) => value.toLowerCase().includes(keyword)))
    );
    if (!next.some((item) => item.id === customerId)) setCustomerId(next[0]?.id || "");
  }

  async function generateDraft() {
    if (!customerId) return;
    setGenerating(true);
    setCopyStatus("");
    try {
      const response = await fetch("/api/follow-up/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, channel, purpose }),
      });
      const data = await response.json() as { draft?: string; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "生成失败。");
      setDraft(data.draft);
      if (channel !== "Phone") setSummary(`已通过 ${channel} 人工联系。\n发送内容：${data.draft}`);
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : "生成失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopyStatus("已复制，可以前往对应平台发送。");
  }

  function openChannel() {
    const url = contactUrl(channel, customer, draft);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setCopyStatus("该客户还没有可用电话号码，请先补充联系方式。");
  }

  if (!customers.length) {
    return <div className="followUpEmpty"><strong>还没有可跟进客户</strong><p>请先审核或新增客户线索。</p></div>;
  }

  return <div className="manualWorkspace">
    <section className="card manualAssistant">
      <div className="panelHeading"><div><h3>{meta.title}</h3><p>{meta.description}</p></div><span className="manualBadge">人工确认发送</span></div>
      <div className="filterGrid">
        <label>客户等级<select value={priority} onChange={(event) => updateFilter(event.target.value, search)}>
          <option value="">全部等级</option>{["A+","A","B","C","D"].map((item) => <option key={item}>{item}</option>)}
        </select></label>
        <label>搜索客户<input value={search} onChange={(event) => updateFilter(priority, event.target.value)} placeholder="公司、国家、邮箱或号码"/></label>
      </div>
      <label>选择客户<select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setDraft(""); setSummary(""); }}>
        {!filteredCustomers.length && <option value="">没有符合条件的客户</option>}
        {filteredCustomers.map((item) => <option key={item.id} value={item.id}>{item.priority} · {item.company} · {item.country || "地区待确认"}</option>)}
      </select></label>
      {customer && <div className="selectedCustomer">
        <div><span>公司</span><strong>{customer.company}</strong></div>
        <div><span>客户类型</span><strong>{customer.customer_type || "待确认"}</strong></div>
        <div><span>可用联系方式</span><strong>{customer.whatsapp || customer.contact_email || "尚未填写"}</strong></div>
        <div><span>下次跟进</span><strong>{customer.next_follow_up_at ? new Date(customer.next_follow_up_at).toLocaleDateString("zh-CN") : "未安排"}</strong></div>
      </div>}
      <label>本次沟通目标（可选）<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：确认秋季采购计划、推荐新系列、了解价格区间"/></label>
      <button type="button" className="secondaryButton fullButton" onClick={generateDraft} disabled={!customerId || generating}>{generating ? "AI 正在生成…" : `生成${meta.draftLabel}`}</button>
      <label>{meta.draftLabel}<textarea className="channelDraft" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="生成后可继续人工修改"/></label>
      <div className="channelActions">
        <button type="button" className="secondaryButton" onClick={copyDraft} disabled={!draft}>复制内容</button>
        <button type="button" className="primary" onClick={openChannel}>{meta.action}</button>
      </div>
      {copyStatus && <p className="channelStatus" role="status">{copyStatus}</p>}
    </section>

    <section className="card manualLog">
      <div className="panelHeading"><div><h3>保存人工跟进记录</h3><p>完成实际联系后再保存，系统将自动安排下一次跟进。</p></div></div>
      <form action={formAction} className="form">
        <input type="hidden" name="customer_id" value={customerId}/>
        <input type="hidden" name="channel" value={channel}/>
        <label>联系时间<input name="happened_at" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)}/></label>
        <label>实际沟通摘要<textarea name="summary" value={summary} onChange={(event) => setSummary(event.target.value)} required placeholder={channel === "Phone" ? "通话结束后记录客户需求、异议、承诺和下一步。" : "确认发送后记录实际发送内容及客户回复。"} /></label>
        <label>结果<select name="outcome" defaultValue="无回复"><option>无回复</option><option>已回复</option><option>有兴趣</option><option>要求报价</option><option>要求样品</option><option>采购计划明确</option><option>暂无采购计划</option><option>明确拒绝</option><option>退订</option><option>联系方式无效</option></select></label>
        <label>下一步<input name="next_action" placeholder="例如：发送产品目录和报价"/></label>
        <label>人工指定下次跟进日期（可选）<input name="next_follow_up_at" type="date"/></label>
        {state.message && <p className={state.ok ? "formSuccess" : "formError"} role="status">{state.message}</p>}
        <button className="primary" disabled={pending || !customerId}>{pending ? "正在保存…" : "保存人工跟进"}</button>
      </form>
    </section>
  </div>;
}
