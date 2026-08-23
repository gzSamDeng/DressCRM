import { eveningDressTemplate } from "./evening-dress";
import type { LeadCandidate, ScoredLead } from "./types";

export function scoreLead(candidate: LeadCandidate): ScoredLead {
  const matchedRules = eveningDressTemplate.buyerDna.filter((rule) =>
    candidate.signals.includes(rule.signal),
  );
  const score = Math.min(100, matchedRules.reduce((total, rule) => total + rule.weight, 0));
  const grade = score >= 80 ? "A+" : score >= 65 ? "A" : score >= 45 ? "B" : "C";
  const risks: string[] = [];

  if (!candidate.signals.includes("importer")) risks.push("尚未发现直接进口证据");
  if (!candidate.signals.includes("premium_positioning")) risks.push("价格带仍需人工确认");
  if (!candidate.signals.includes("evening_dress_focus")) risks.push("晚礼服可能不是核心采购品类");

  return {
    ...candidate,
    score,
    grade,
    confidence: candidate.evidence.length >= 3 ? "High" : "Medium",
    reasons: matchedRules.slice(0, 4).map((rule) => `${rule.label} +${rule.weight}`),
    risks,
    recommendation:
      score >= 80
        ? "优先联系：推荐 Premium 与手工钉珠系列，先确认季度采购计划。"
        : score >= 65
          ? "进入重点培育：补充采购负责人和进口记录后联系。"
          : "保留观察：继续收集价格带、品牌组合与采购模式证据。",
  };
}
