"use client";

import { useState } from "react";
import { createCustomer } from "@/app/actions";
import { demoCandidates } from "@/lib/lead-intelligence/demo-connector";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { scoreLead } from "@/lib/lead-intelligence/score";
import type { ScoredLead } from "@/lib/lead-intelligence/types";

type RunState = "ready" | "searching" | "complete";

export function LeadIntelligenceWorkbench() {
  const [runState, setRunState] = useState<RunState>("complete");
  const [minimumScore, setMinimumScore] = useState(45);
  const [query, setQuery] = useState("Turkey luxury evening dress importer boutique");
  const [results, setResults] = useState<ScoredLead[]>(
    demoCandidates.map(scoreLead).filter((lead) => lead.score >= 45).sort((a, b) => b.score - a.score),
  );
  const [candidatesFound, setCandidatesFound] = useState(demoCandidates.length);
  const [error, setError] = useState("");

  async function runSearch() {
    setRunState("searching");
    setError("");
    try {
      const response = await fetch("/api/lead-intelligence/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, minimumScore }),
      });
      const payload = (await response.json()) as { error?: string; candidatesFound?: number; leads?: ScoredLead[] };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "搜索失败，请稍后重试。");
      setResults(payload.leads ?? []);
      setCandidatesFound(payload.candidatesFound ?? 0);
      setRunState("complete");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "搜索失败，请稍后重试。");
      setRunState("complete");
    }
  }

  return (
    <div className="intelligenceGrid">
      <aside className="strategyPanel">
        <div className="eyebrow">INDUSTRY TEMPLATE</div>
        <h2>{eveningDressTemplate.productLine}</h2>
        <p className="muted">Fashion · {eveningDressTemplate.market}</p>
        <div className="strategyBlock">
          <span className="strategyLabel">AI 搜索关键词</span>
          <div className="chipList">
            {eveningDressTemplate.keywords.map((keyword) => <span className="chip" key={keyword}>{keyword}</span>)}
          </div>
        </div>
        <div className="strategyBlock">
          <span className="strategyLabel">Buyer DNA 权重</span>
          <div className="dnaList">
            {eveningDressTemplate.buyerDna.map((rule) => (
              <div className="dnaRule" key={rule.signal}><span>{rule.label}</span><strong>+{rule.weight}</strong></div>
            ))}
          </div>
        </div>
        <div className="connectorStatus">
          <span className="statusDot" />
          <div><strong>Serper · Google Search</strong><small>真实网页搜索，服务端安全调用</small></div>
        </div>
      </aside>

      <section className="workbench">
        <div className="pageIntro">
          <div>
            <div className="eyebrow">AI LEAD INTELLIGENCE</div>
            <h1>自动寻找高潜力买家</h1>
            <p>AI 根据行业关键词搜索候选公司，并用 Buyer DNA 解释每一个分数。</p>
          </div>
          <span className="templateBadge">Fashion / Evening Dress</span>
        </div>

        <div className="searchConsole">
          <label>搜索任务<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label>最低 AI Score
            <select value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))}>
              <option value={45}>45 · B 以上</option><option value={65}>65 · A 以上</option><option value={80}>80 · A+ only</option>
            </select>
          </label>
          <button className="runButton" type="button" onClick={runSearch} disabled={runState === "searching"}>
            {runState === "searching" ? "AI 正在搜索与分析…" : runState === "complete" ? "重新运行搜索" : "运行 AI 搜索"}
          </button>
        </div>
        {error && <div className="searchError"><strong>搜索未完成</strong><span>{error}</span></div>}

        {runState === "ready" ? (
          <div className="emptyIntelligence"><span className="aiOrb">AI</span><h3>搜索策略已准备好</h3><p>点击“运行 AI 搜索”，查看候选买家、评分证据与行动建议。</p></div>
        ) : runState === "searching" ? (
          <div className="searchingState">
            {["执行 5 组行业关键词", "识别公司与采购信号", "匹配 Buyer DNA", "生成评分与建议"].map((step, index) => (
              <div className="searchStep" key={step}><span>{index + 1}</span>{step}</div>
            ))}
          </div>
        ) : (
          <>
            <div className="resultSummary">
              <div><span>发现候选</span><strong>{candidatesFound}</strong></div>
              <div><span>进入评分</span><strong>{results.length}</strong></div>
              <div><span>A / A+ 线索</span><strong>{results.filter((lead) => lead.score >= 65).length}</strong></div>
              <div><span>最高分</span><strong>{results[0]?.score ?? "—"}</strong></div>
            </div>
            <div className="leadList">
              {results.map((lead, index) => (
                <article className="leadCard" key={lead.id}>
                  <div className="rank">#{String(index + 1).padStart(2, "0")}</div>
                  <div className={`scoreRing grade${lead.grade.replace("+", "plus")}`}><strong>{lead.score}</strong><span>{lead.grade}</span></div>
                  <div className="leadMain">
                    <div className="leadHeading">
                      <div><h3>{lead.company}</h3><p>{lead.city}, {lead.country} · {lead.customerType}</p></div>
                      <span className="confidence">{lead.confidence} confidence</span>
                    </div>
                    <p className="leadDescription">{lead.description}</p>
                    <div className="reasonGrid">
                      <div><span className="reasonTitle">为什么值得联系</span>{lead.reasons.map((reason) => <span className="positiveSignal" key={reason}>✓ {reason}</span>)}</div>
                      <div><span className="reasonTitle">仍需确认</span>{lead.risks.length ? lead.risks.map((risk) => <span className="riskSignal" key={risk}>! {risk}</span>) : <span className="positiveSignal">✓ 核心购买信号完整</span>}</div>
                    </div>
                    <div className="recommendation"><strong>AI 建议</strong>{lead.recommendation}</div>
                  </div>
                  <div className="leadActions">
                    <a href={lead.sourceUrl} target="_blank" rel="noreferrer">查看证据</a>
                    <form action={createCustomer}>
                      <input type="hidden" name="company" value={lead.company} /><input type="hidden" name="website" value={lead.website} />
                      <input type="hidden" name="country" value={lead.country} /><input type="hidden" name="city" value={lead.city} />
                      <input type="hidden" name="customer_type" value={lead.customerType} /><input type="hidden" name="priority" value={lead.grade} />
                      <input type="hidden" name="stage" value="New Lead" /><input type="hidden" name="product_category" value="Premium Evening Dress" />
                      <input type="hidden" name="premium_fit" value={lead.score} /><input type="hidden" name="couture_fit" value={Math.max(0, lead.score - 8)} />
                      <input type="hidden" name="import_probability" value={lead.signals.includes("importer") ? "High" : "Needs verification"} />
                      <input type="hidden" name="buyer_value" value={`AI Score ${lead.score} · ${lead.grade}`} />
                      <input type="hidden" name="recommended_line" value={lead.recommendation} /><input type="hidden" name="evidence" value={lead.evidence.join("\n")} />
                      <input type="hidden" name="source_url" value={lead.sourceUrl} /><input type="hidden" name="notes" value="由 AI Lead Intelligence MVP 发现并审批进入 CRM。" />
                      <button type="submit">批准进入 CRM</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
            <p className="demoNotice">首次打开显示演示结果；点击“重新运行搜索”后将使用 Serper 获取真实 Google 搜索结果，并保存搜索任务与候选线索。</p>
          </>
        )}
      </section>
    </div>
  );
}
