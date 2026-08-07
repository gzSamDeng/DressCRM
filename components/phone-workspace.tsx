"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addManualFollowUp, type FollowUpActionState } from "@/app/actions";
import type { FollowUpCustomerOption } from "@/components/manual-follow-up-workspace";

type TelnyxCall = { id?: string; state?: string; hangup: () => void };
type TelnyxClient = {
  remoteElement: string;
  connect: () => void;
  disconnect: () => void;
  newCall: (options: Record<string, unknown>) => TelnyxCall;
  on: (event: string, handler: (payload?: { call?: TelnyxCall; type?: string }) => void) => TelnyxClient;
};

declare global {
  interface Window {
    TelnyxWebRTC?: { TelnyxRTC: new (options: Record<string, unknown>) => TelnyxClient };
  }
}

const initialState: FollowUpActionState = { ok: false, message: "" };

function loadTelnyxSdk() {
  if (window.TelnyxWebRTC) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-telnyx-webrtc="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("电话组件加载失败。")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@telnyx/webrtc@2.9.0/lib/bundle.js";
    script.async = true;
    script.dataset.telnyxWebrtc = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("电话组件加载失败，请检查网络。"));
    document.head.appendChild(script);
  });
}

export function PhoneWorkspace({
  customers,
  configured,
  initialCustomerId,
}: {
  customers: FollowUpCustomerOption[];
  configured: boolean;
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
  const [status, setStatus] = useState(configured ? "电话线路尚未连接" : "等待管理员配置 Telnyx");
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [inCall, setInCall] = useState(false);
  const clientRef = useRef<TelnyxClient | null>(null);
  const callRef = useRef<TelnyxCall | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const loggedRef = useRef(new Set<string>());
  const customer = customers.find((item) => item.id === customerId);
  const destination = (customer?.whatsapp || "").replace(/[^\d+]/g, "");

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return customers.filter((item) =>
      (!priority || item.priority === priority)
      && (!keyword || [item.company, item.country || "", item.whatsapp || ""].some((value) => value.toLowerCase().includes(keyword))),
    );
  }, [customers, priority, search]);

  useEffect(() => () => clientRef.current?.disconnect(), []);
  useEffect(() => { if (formState.ok) router.refresh(); }, [formState.ok, router]);

  async function saveAutomaticCallLog(call: TelnyxCall, callStatus: string) {
    const key = call.id || startedAtRef.current || "";
    if (!key || loggedRef.current.has(key) || !startedAtRef.current) return;
    loggedRef.current.add(key);
    await fetch("/api/voice/call-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        destination,
        call_id: call.id,
        started_at: startedAtRef.current,
        ended_at: new Date().toISOString(),
        status: callStatus,
      }),
    });
    router.refresh();
  }

  async function connectPhone() {
    if (!configured || connecting || ready) return;
    setConnecting(true);
    setStatus("正在申请麦克风权限并连接电话线路…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await loadTelnyxSdk();
      const response = await fetch("/api/voice/token", { method: "POST" });
      const data = await response.json() as { token?: string; callerNumber?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "电话令牌获取失败。");
      const Constructor = window.TelnyxWebRTC?.TelnyxRTC;
      if (!Constructor) throw new Error("电话组件没有正确加载。");
      const client = new Constructor({ login_token: data.token, enableCallReports: true });
      client.remoteElement = "telnyxRemoteAudio";
      client
        .on("telnyx.ready", () => { setReady(true); setConnecting(false); setStatus(`电话线路已连接 · 主叫 ${data.callerNumber || "Telnyx"}`); })
        .on("telnyx.error", () => { setReady(false); setConnecting(false); setStatus("电话线路连接失败，请检查管理员配置。"); })
        .on("telnyx.notification", (notification) => {
          const call = notification?.call;
          if (!call) return;
          callRef.current = call;
          const callState = call.state || notification?.type || "更新中";
          setStatus(`通话状态：${callState}`);
          if (["active", "answered"].includes(callState)) setInCall(true);
          if (["destroy", "destroyed", "hangup", "purge"].includes(callState)) {
            setInCall(false);
            void saveAutomaticCallLog(call, callState);
          }
        });
      clientRef.current = client;
      client.connect();
    } catch (error) {
      setConnecting(false);
      setStatus(error instanceof Error ? error.message : "电话线路连接失败。");
    }
  }

  function dial() {
    if (!clientRef.current || !ready || !destination) return;
    startedAtRef.current = new Date().toISOString();
    const call = clientRef.current.newCall({ destinationNumber: destination, audio: true });
    callRef.current = call;
    setInCall(true);
    setStatus(`正在拨打 ${destination}…`);
  }

  function hangup() {
    callRef.current?.hangup();
    setInCall(false);
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
      <div className="panelHeading"><div><h3>网页电话</h3><p>通过 Telnyx WebRTC 在当前网页内真正拨打国际电话，不再打开空白浏览器窗口。</p></div><span className={configured ? "connectedBadge" : "manualBadge"}>{configured ? "线路已配置" : "等待配置"}</span></div>
      {!configured && <div className="integrationSetup"><strong>管理员需要在 Vercel 配置 3 项</strong><code>TELNYX_API_KEY</code><code>TELNYX_TELEPHONY_CREDENTIAL_ID</code><code>TELNYX_CALLER_NUMBER</code><p>同时需在 Telnyx 购买号码、创建 Credential Connection，并为线路开通可拨国家。</p></div>}
      <div className="filterGrid">
        <label>客户等级<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">全部等级</option>{["A+","A","B","C","D"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>搜索客户<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="公司、国家或电话号码"/></label>
      </div>
      <label>选择客户<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{filtered.map((item) => <option value={item.id} key={item.id}>{item.priority} · {item.company} · {item.whatsapp || "无号码"}</option>)}</select></label>
      <div className="phoneDialBar"><div><span>拨打号码</span><strong>{destination || "该客户没有电话号码"}</strong></div><button type="button" className="secondaryButton" onClick={connectPhone} disabled={!configured || connecting || ready}>{ready ? "线路已连接" : connecting ? "正在连接…" : "连接电话"}</button><button type="button" className="primary" onClick={inCall ? hangup : dial} disabled={!ready || !destination}>{inCall ? "挂断" : "拨号"}</button></div>
      <audio id="telnyxRemoteAudio" autoPlay/>
      <p className="channelStatus" role="status">{status}</p>
      <label>本次沟通目标（可选）<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例如：确认秋季采购计划"/></label>
      <button type="button" className="secondaryButton fullButton" onClick={generateOutline} disabled={!customerId}>生成 AI 通话提纲</button>
      <label>AI 通话提纲<textarea className="channelDraft" value={outline} onChange={(event) => setOutline(event.target.value)} /></label>
    </section>
    <section className="card manualLog">
      <div className="panelHeading"><div><h3>补充通话摘要</h3><p>拨号结果会自动留痕；接通后请补充客户需求、异议和下一步。</p></div></div>
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
