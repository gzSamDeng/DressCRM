"use client";

import { useState } from "react";

type MonitorResult = {
  candidatesFound?: number;
  insertedCount?: number;
  duplicateCount?: number;
  warnings?: string[];
  successfulQueries?: number;
  failedQueries?: number;
  rejectedInvalidCount?: number;
  error?: string;
};

export function BuyerDemandMonitor() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  async function runMonitor() {
    setRunning(true);
    setMessage("正在检查公开 RFQ、采购帖子和买家需求……");
    try {
      const response = await fetch("/api/lead-intelligence/import-demands", { method: "POST" });
      const payload = await response.json() as MonitorResult;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "监测失败，请稍后重试。");
      const warning = payload.warnings?.length
        ? `另外有 ${payload.failedQueries ?? payload.warnings.length} 组来源暂时失败，其余 ${payload.successfulQueries ?? 0} 组已正常完成。`
        : "";
      const cleanup = payload.rejectedInvalidCount
        ? `已将 ${payload.rejectedInvalidCount} 条非详情页错误线索移出待审核。`
        : "";
      setMessage(`发现 ${payload.candidatesFound ?? 0} 条合格需求，新增 ${payload.insertedCount ?? 0} 条；已自动跳过 ${payload.duplicateCount ?? 0} 条重复记录。${cleanup}${warning}`);
      window.setTimeout(() => { window.location.href = "/lead-intelligence?reviewStatus=pending#review-center"; }, warning ? 3500 : 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "监测失败，请稍后重试。");
      setRunning(false);
    }
  }
  return <section className="buyerDemandMonitor"><div><span className="eyebrow">ACTIVE BUYER DEMAND</span>
    <h2>采购需求监测</h2><p>检查公开 RFQ 与采购帖子，只保留明确寻找晚礼服供应商、生产商或采购产品的需求；自动过滤供应商广告、过期信息和重复记录。</p>
    <div className="demandRules"><span>明确采购意图</span><span>产品匹配</span><span>时效校验</span><span>来源可追溯</span></div></div>
    <div className="monitorAction"><button type="button" onClick={runMonitor} disabled={running}>{running ? "监测中……" : "监测最新采购需求"}</button>{message && <small>{message}</small>}</div>
    <style>{`.buyerDemandMonitor{margin:28px 0 0;display:flex;justify-content:space-between;gap:28px;align-items:center;padding:24px;border:1px solid #bcd8d0;border-radius:18px;background:linear-gradient(135deg,#f4fbf8,#fffdf8)}.buyerDemandMonitor h2{font:30px Georgia,serif;margin:5px 0 8px}.buyerDemandMonitor p{max-width:840px;margin:0;color:#5f6e68;line-height:1.65}.demandRules{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}.demandRules span{padding:5px 9px;border-radius:999px;background:#e1f1eb;color:#245947;font-size:12px;font-weight:700}.monitorAction{min-width:220px;display:grid;gap:9px}.monitorAction button{border:0;border-radius:10px;padding:13px 16px;background:#176b55;color:#fff;font-weight:800;cursor:pointer}.monitorAction button:disabled{opacity:.55;cursor:wait}.monitorAction small{max-width:260px;color:#5f6e68;line-height:1.5}@media(max-width:800px){.buyerDemandMonitor{display:block}.monitorAction{margin-top:18px;min-width:0}}`}</style>
  </section>;
}
