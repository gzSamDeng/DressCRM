"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addManualFollowUp, type FollowUpActionState } from "@/app/actions";
import type { FollowUpCustomerOption } from "@/components/manual-follow-up-workspace";

const initialState: FollowUpActionState = { ok: false, message: "" };
const didwwAppDocs = "https://doc.didww.com/phone-systems/app/index.html";

function normalizeDestination(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function matchesFilters(item: FollowUpCustomerOption, priority: string, search: string) {
  const keyword = search.trim().toLowerCase();
  return (!priority || item.priority === priority)
    && (!keyword || [item.company, item.country || "", item.whatsapp || ""].some((value) => value.toLowerCase().includes(keyword)));
}

export function PhoneWorkspace({
  customers,
  configured,
  callerNumber,
  initialCustomerId,
}: {
  customers: FollowUpCustomerOption[];
  configured: boolean;
  callerNumber?: string;
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const [formState, formAction, formPending] = useActionState(addManualFollowUp, initialState);
  const [customerId, setCustomerId] = useState(
    customers.some((item) => item.id === initialCustomerId) ? initialCustomerId! : customers[0]?.id || "",
  );
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outline, setOutline] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState(
    configured ? "DIDWW 电话线路已配置，可以发起拨号。" : "等待管理员开通 DIDWW phone.systems 线路。",
  );
  const [dialing, setDialing] = useState(false);
  const [savingCall, setSavingCall] = useState(false);
  const startedAtRef = useRef<string | null>(null);
  const customer = customers.find((item) => item.id === customerId);
  const destination = normalizeDestination(customer?.whatsapp);

  const filtered = useMemo(() => {
    return customers.filter((item) => matchesFilters(item, priority, search));
  }, [customers, priority, search]);

  useEffect(() => { if (formState.ok) router.refresh(); }, [formState.ok, router]);

  function applyFilters(nextPriority: string, nextSearch: string) {
    const nextCustomers = customers.filter((item) => matchesFilters(item, nextPriority, nextSearch));
    if (!nextCustomers.some((item) => item.id === customerId)) setCustomerId(nextCustomers[0]?.id || "");
  }

  function dial() {
    if (!configured || !destination || dialing) return;
    startedAtRef.current = new Date().toISOString();
    setDialing(true);
    setStatus(`已向 DIDWW phone.systems 发起拨号：${destination}。通话结束后请返回本页保存结果。`);
    window.location.href = `phone.systems://call?number=${encodeURIComponent(destination)}`;
  }

  async function finishAndLogCall() {
    if (!startedAtRef.current || savingCall) return;
    setSavingCall(true);
    try {
      const response = await fetch("/api/voice/call-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          destination,
          provider: "DIDWW phone.systems",
          started_at: startedAtRef.current,
          ended_at: new Date().toISOString(),
          status: "业务员结束通话",
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "通话留痕失败。");
      startedAtRef.current = null;
      setDialing(false);
      setStatus("通话拨号记录已保存。请在右侧补充客户反馈和下一步。 ");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "通话留痕失败。");
    } finally {
      setSavingCall(false);
    }
  }

  async function generateOutline() {
    const response = await fetch("/api/follow-up/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, channel: "Phone", purpose }),
    });
    const data = await response.json() as { draft?: string; error?: string };
    setOutline(data.draft || data.error || "通话提纲生成失败。");
  }

  return <div className="manualWorkspace phoneWorkspace">
    <section className="card manualAssistant">
      <div className="panelHeading"><div><h3>DIDWW 电脑电话</h3><p>从系统一键唤起 DIDWW phone.systems 桌面应用并拨打客户电话。</p></div><span className={configured ? "connectedBadge" : "manualBadge"}>{configured ? "线路已配置" : "等待开通"}</span></div>
      {!configured && <div className="integrationSetup">
        <strong>首次使用需要管理员完成以下配置</strong>
        <p>在 DIDWW 开通号码和外呼权限，启用 phone.systems 电话系统，为每位业务员创建应用线路并安装桌面客户端。</p>
        <code>DIDWW_PHONE_SYSTEMS_ENABLED=true</code>
        <code>DIDWW_CALLER_NUMBER=已购买的主叫号码</code>
        <a className="secondaryButton" href={didwwAppDocs} target="_blank" rel="noreferrer">查看 DIDWW 官方安装说明</a>
      </div>}
      <div className="filterGrid">
        <label>客户等级<select value={priority} onChange={(event) => { const value = event.target.value; setPriority(value); applyFilters(value, search); }}><option value="">全部等级</option>{["A+","A","B","C","D"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>搜索客户<input value={search} onChange={(event) => { const value = event.target.value; setSearch(value); applyFilters(priority, value); }} placeholder="公司、国家或电话号码"/></label>
      </div>
      <label>选择客户<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{filtered.map((item) => <option value={item.id} key={item.id}>{item.priority} · {item.company} · {item.whatsapp || "无号码"}</option>)}</select></label>
      <div className="phoneDialBar">
        <div><span>拨打号码</span><strong>{destination || "该客户没有电话号码"}</strong>{callerNumber && <small>主叫：{callerNumber}</small>}</div>
        <button type="button" className="primary" onClick={dial} disabled={!configured || !destination || dialing}>{dialing ? "已发起拨号" : "用 DIDWW 拨号"}</button>
        {dialing && <button type="button" className="secondaryButton" onClick={finishAndLogCall} disabled={savingCall}>{savingCall ? "正在保存…" : "结束并留痕"}</button>}
      </div>
      <p className="channelStatus" role="status">{status}</p>
      <p className="integrationHint">电脑需要先安装并登录 phone.systems。浏览器首次唤起时请选择“允许打开”，之后拨号会直接进入 DIDWW 电话应用。</p>
      <label>本次沟通目标（可选）<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：确认秋季采购计划"/></label>
      <button type="button" className="secondaryButton fullButton" onClick={generateOutline} disabled={!customerId}>生成 AI 通话提纲</button>
      <label>AI 通话提纲<textarea className="channelDraft" value={outline} onChange={(event) => setOutline(event.target.value)} /></label>
    </section>
    <section className="card manualLog">
      <div className="panelHeading"><div><h3>补充通话摘要</h3><p>DIDWW 保存线路通话记录；业务员在这里补充客户需求、异议和下一步。</p></div></div>
      <form action={formAction} className="form">
        <input type="hidden" name="customer_id" value={customerId}/><input type="hidden" name="channel" value="Phone"/>
        <label>联系时间<input name="happened_at" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)}/></label>
        <label>通话摘要<textarea name="summary" value={summary} onChange={(event) => setSummary(event.target.value)} required placeholder="记录客户需求、异议、采购计划、我方承诺和下一步。"/></label>
        <label>结果<select name="outcome" defaultValue="已接通"><option>已接通</option><option>无回复</option><option>有兴趣</option><option>要求报价</option><option>采购计划明确</option><option>暂无采购计划</option><option>明确拒绝</option><option>号码无效</option></select></label>
        <label>下一步<input name="next_action" placeholder="例如：发送目录并在一周后回访"/></label>
        <label>下次跟进日期（可选）<input name="next_follow_up_at" type="date"/></label>
        {formState.message && <p className={formState.ok ? "formSuccess" : "formError"}>{formState.message}</p>}
        <button className="primary" disabled={formPending || !customerId}>{formPending ? "正在保存…" : "保存通话摘要"}</button>
      </form>
    </section>
  </div>;
}
