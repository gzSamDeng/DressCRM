"use client";

import { useState } from "react";

type MonitorResult = {
  candidatesFound?: number;
  insertedCount?: number;
  duplicateCount?: number;
  searchQueryCount?: number;
  rawResultsCount?: number;
  qualifiedCandidatesCount?: number;
  warnings?: string[];
  successfulQueries?: number;
  failedQueries?: number;
  rejectedInvalidCount?: number;
  verificationRejectedCount?: number;
  error?: string;
};

export function BuyerDemandMonitor() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"incremental" | "bootstrap">("incremental");
  async function runMonitor() {
    const startedAt = Date.now();
    setRunning(true);
    setMessage(`正在执行 ${mode === "bootstrap" ? "初始化/策略补漏" : "日常增量"}采购需求扫描……`);
    try {
      const response = await fetch("/api/lead-intelligence/import-demands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json() as MonitorResult;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "监测失败，请稍后重试。");
      const warning = payload.warnings?.length
        ? `另外有 ${payload.failedQueries ?? payload.warnings.length} 组来源暂时失败，其余 ${payload.successfulQueries ?? 0} 组已正常完成。`
        : "";
      const cleanup = payload.rejectedInvalidCount
        ? `已将 ${payload.rejectedInvalidCount} 条历史误报移出待审核。`
        : "";
      const verification = payload.verificationRejectedCount
        ? `另有 ${payload.verificationRejectedCount} 条搜索结果因原页面无法证明真实采购意向而未入库。`
        : "";
      const strategy = mode === "bootstrap" ? "初始化/策略补漏" : "日常增量";
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const inserted = payload.insertedCount ?? 0;
      const coverage = `已执行 ${payload.successfulQueries ?? 0}/${payload.searchQueryCount ?? 0} 组来源搜索，检查 ${payload.rawResultsCount ?? 0} 条网页结果，筛出 ${payload.qualifiedCandidatesCount ?? 0} 条具体询盘候选。`;
      const outcome = inserted > 0
        ? `核验通过 ${payload.candidatesFound ?? 0} 条，新增 ${inserted} 条待审核；跳过 ${payload.duplicateCount ?? 0} 条重复记录。`
        : `本轮没有核验通过的新需求，因此没有向待审核列表写入数据。`;
      setMessage(`【${strategy} · ${elapsedSeconds}秒】${coverage}${outcome}${cleanup}${verification}${warning}`);
      if (inserted > 0) {
        window.setTimeout(() => { window.location.href = "/lead-intelligence?reviewStatus=pending#review-center"; }, warning ? 3500 : 1800);
      }
      setRunning(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "监测失败，请稍后重试。");
      setRunning(false);
    }
  }
  const nextRunHint = mode === "incremental"
    ? "日常主模式：建议每天运行，持续发现最近60天内新增的真实采购需求。"
    : "仅在首次交付或新增搜索来源后使用；扩大来源覆盖，但仍严格限定最近60天。";
  return <section className="buyerDemandMonitor"><div><span className="eyebrow">ACTIVE BUYER DEMAND</span>
    <h2>采购需求监测</h2><p>搜索结果不会直接进入系统；必须打开具体询盘页，并同时核实礼服产品、采购动作和询盘明细后才进入待审核。</p>
    <div className="monitorMode">
      <label>任务模式
        <select value={mode} onChange={(event) => setMode(event.target.value as "incremental" | "bootstrap")}>
          <option value="incremental">日常增量（近60天）</option>
          <option value="bootstrap">首次初始化/策略补漏（近60天）</option>
        </select>
      </label>
      <div className="modeHint">! {nextRunHint}</div>
    </div>
    <div className="demandRules"><span>标题明确采购</span><span>礼服产品匹配</span><span>原页面二次核验</span><span>失败不入库</span></div></div>
    <div className="monitorAction"><button type="button" onClick={runMonitor} disabled={running}>{running ? "正在搜索并核验来源……" : "运行一轮采购需求增量搜索"}</button>{message && <small>{message}</small>}</div>
    <style>{`.buyerDemandMonitor{margin:28px 0 0;display:flex;justify-content:space-between;gap:28px;align-items:center;padding:24px;border:1px solid #bcd8d0;border-radius:18px;background:linear-gradient(135deg,#f4fbf8,#fffdf8)}.buyerDemandMonitor h2{font:30px Georgia,serif;margin:5px 0 8px}.buyerDemandMonitor p{max-width:840px;margin:0;color:#5f6e68;line-height:1.65}.monitorMode{display:grid;gap:8px}.monitorMode label{display:flex;gap:8px;align-items:center}.monitorMode select{border:1px solid #b5c9c2;border-radius:8px;padding:6px 8px;font-size:12px}.modeHint{margin-top:8px;font-size:12px;color:#6a4e00;background:#fff6db;padding:4px 9px;border-radius:10px;display:inline-block;max-width:380px}.demandRules{display:flex;flex-wrap:wrap;gap:7px;margin-top:13px}.demandRules span{padding:5px 9px;border-radius:999px;background:#e1f1eb;color:#245947;font-size:12px;font-weight:700}.monitorAction{min-width:220px;display:grid;gap:9px}.monitorAction button{border:0;border-radius:10px;padding:13px 16px;background:#176b55;color:#fff;font-weight:800;cursor:pointer}.monitorAction button:disabled{opacity:.55;cursor:wait}.monitorAction small{max-width:260px;color:#5f6e68;line-height:1.5}@media(max-width:800px){.buyerDemandMonitor{display:block}.monitorAction{margin-top:18px;min-width:0}}`}</style>
  </section>;
}
