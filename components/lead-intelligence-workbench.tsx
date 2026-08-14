"use client";

import { useState } from "react";
import { createCustomer } from "@/app/actions";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import type { ScoredLead } from "@/lib/lead-intelligence/types";
import { formatEvidenceList } from "@/lib/lead-intelligence/evidence";

type RunState = "ready" | "searching" | "complete";

export function LeadIntelligenceWorkbench() {
  const [runState, setRunState] = useState<RunState>("ready");
  const [minimumScore, setMinimumScore] = useState(45);
  const [marketPack, setMarketPack] = useState("global_priority");
  const [query, setQuery] = useState("premium evening dress buyer");
  const [results, setResults] = useState<ScoredLead[]>([]);
  const [candidatesFound, setCandidatesFound] = useState(0);
  const [error, setError] = useState("");
  const [customsImport, setCustomsImport] = useState<{ running: boolean; processed: number; total: number; message: string }>({ running: false, processed: 0, total: 39, message: "" });

  async function runSearch() {
    setRunState("searching");
    setError("");
    try {
      const response = await fetch("/api/lead-intelligence/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, minimumScore, marketPack }),
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

  async function importCustomsData() {
    setCustomsImport({ running: true, processed: 0, total: 39, message: "正在核验企业官网与联系方式…" });
    let offset = 0;
    try {
      while (true) {
        const response = await fetch("/api/lead-intelligence/import-customs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: 2 }),
        });
        const payload = await response.json() as { error?: string; nextOffset?: number; total?: number; complete?: boolean; totalImported?: number };
        if (!response.ok || payload.error) throw new Error(payload.error ?? "海关数据导入失败。");
        offset = payload.nextOffset ?? offset + 2;
        setCustomsImport({ running: !payload.complete, processed: offset, total: payload.total ?? 39, message: payload.complete ? `已完成，待审核列表现有 ${payload.totalImported ?? 0} 条海关线索。` : "正在核验企业官网与联系方式…" });
        if (payload.complete) {
          window.location.href = "/lead-intelligence?reviewStatus=pending#review-center";
          break;
        }
      }
    } catch (importError) {
      setCustomsImport((current) => ({ ...current, running: false, message: importError instanceof Error ? importError.message : "海关数据导入失败。" }));
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
        <div className="strategyBlock">
          <span className="strategyLabel">海关进口客户</span>
          <p className="muted">附件已去重并保留每次进口日期，导入后统一进入待审核。</p>
          <button className="secondaryButton" type="button" onClick={importCustomsData} disabled={customsImport.running}>
            {customsImport.running ? `处理中 ${Math.min(customsImport.processed, customsImport.total)} / ${customsImport.total}` : "导入并在线补全海关线索"}
          </button>
          {customsImport.message && <small style={{display:"block",marginTop:8}}>{customsImport.message}</small>}
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
          <label>市场范围
            <select value={marketPack} onChange={(event) => setMarketPack(event.target.value)}>
              <option value="global_priority">全球重点市场</option>
              <option value="north_america">美国与加拿大</option>
              <option value="europe">欧洲</option>
              <option value="australia_nz">澳大利亚与新西兰</option>
              <option value="russia">俄罗斯</option>
              <option value="gulf">海湾国家</option>
              <option value="turkey">土耳其</option>
            </select>
          </label>
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
                    <details className="evidenceDetails">
                      <summary>查看证据</summary>
                      <div>{formatEvidenceList(lead.evidence).map((item, itemIndex) => <p key={`${itemIndex}-${item}`}>{item}</p>)}</div>
                      {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer">打开原始网页（可能受网站限制）</a>}
                    </details>
                    <form action={createCustomer}>
                      <input type="hidden" name="company" value={lead.company} /><input type="hidden" name="website" value={lead.website} />
                      <input type="hidden" name="country" value={lead.country} /><input type="hidden" name="city" value={lead.city} />
                      <input type="hidden" name="customer_type" value={lead.customerType} /><input type="hidden" name="priority" value={lead.grade} />
                      <input type="hidden" name="stage" value="New Lead" /><input type="hidden" name="product_category" value="Premium Evening Dress" />
                      <input type="hidden" name="premium_fit" value={lead.score} /><input type="hidden" name="couture_fit" value={Math.max(0, lead.score - 8)} />
                      <input type="hidden" name="import_probability" value={lead.signals.includes("importer") ? "High" : "Needs verification"} />
                      <input type="hidden" name="buyer_value" value={`AI Score ${lead.score} · ${lead.grade}`} />
                      <input type="hidden" name="recommended_line" value={lead.recommendation} /><input type="hidden" name="evidence" value={formatEvidenceList(lead.evidence).join("\n")} />
                      <input type="hidden" name="source_url" value={lead.sourceUrl} /><input type="hidden" name="notes" value="由 AI Lead Intelligence MVP 发现并审批进入 CRM。" />
                      <button type="submit">批准进入 CRM</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
            <p className="demoNotice">本次搜索结果已保存到下方待审核中心，可分页查看，不会因刷新页面而丢失。</p>
          </>
        )}
      </section>
    </div>
  );
}
