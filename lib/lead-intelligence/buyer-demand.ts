import { createHash } from "node:crypto";

type SerperOrganicResult = { title?: string; link?: string; snippet?: string; date?: string };
type SerperResponse = { organic?: SerperOrganicResult[]; message?: string };

export type BuyerDemandSearchResult = {
  demands: BuyerDemandLead[];
  warnings: string[];
  searchQueryCount: number;
  rawResultsCount: number;
  qualifiedCandidatesCount: number;
  successfulQueries: number;
  failedQueries: number;
  verificationRejectedCount: number;
};

export type BuyerDemandSearchMode = "incremental" | "bootstrap";

export const BUYER_DEMAND_MAX_AGE_DAYS = 60;

export type BuyerDemandLead = {
  sourceKey: string; company: string; country: string | null; customerType: string;
  score: number; grade: "A+" | "A" | "B"; confidence: "high" | "medium";
  signals: string[]; evidence: string[]; risks: string[]; recommendation: string;
  sourceUrl: string; platform: string; publishedAt: string | null; quantity: string | null;
  contactName: string | null;
};

const incrementalSearchQueries = [
  'site:go4worldbusiness.com/buylead/view/ ("evening dress" OR "evening wear" OR "prom dress" OR "formal gown") (wanted OR "quantity required")',
  'site:go4worldbusiness.com/buylead/view/ ("beaded gown" OR "plus size evening dress" OR "cocktail dress") (wanted OR buyer)',
  'site:sourcing.alibaba.com/rfq/ ("evening dress" OR "prom dress" OR "formal gown")',
  'site:tradekey.com/buyoffer/ ("evening dress" OR "prom dress" OR "formal wear")',
  'site:tradeindia.com/buyoffer/ ("evening dress" OR "party dress" OR "formal gown")',
  'site:exportersindia.com/buy-leads/ ("evening dress" OR "prom dress" OR "occasion wear")',
  'site:linkedin.com/posts/ (RFQ OR "looking for supplier" OR sourcing) ("evening dresses" OR "prom dresses" OR "formal gowns")',
];
const bootstrapSearchQueries = [
  ...incrementalSearchQueries,
  '(RFQ OR "buying request" OR "looking for supplier") ("evening dresses" OR "prom dresses" OR "formal gowns" OR occasionwear) wholesale',
  '("looking for" OR seeking) ("evening dress manufacturer" OR "formalwear supplier" OR "private label prom dress")',
  '("ищу поставщика" OR "закупаем" OR "оптом требуется") ("вечерние платья" OR "платья для выпускного")',
  '("procurement" OR "vendor wanted" OR "supplier needed") ("beaded evening gowns" OR "plus size formal dresses")',
];

const productPattern = /\b(evening\s*(dress|wear|gown)s?|prom\s*(dress|gown)s?|formal\s*(dress|wear|gown)s?|occasion\s*wear|cocktail\s*dresses|ball\s*gowns?|mother[- ]of[- ]the[- ]bride|beaded\s*gowns?|sequin\s*dresses)\b|вечерн\w*\s+плать\w*|плать\w*\s+для\s+выпускн\w*/i;
const intentPattern = /\b(wanted|want to buy|buying request|purchase requirement|quantity required|request for quotation|rfq|looking for (a )?(supplier|manufacturer|vendor)|seeking (a )?(supplier|manufacturer|vendor)|need (a )?(supplier|manufacturer)|sourcing (a )?(supplier|manufacturer))\b|ищу\s+поставщик\w*|закупаем|оптом\s+требуется|запрос\s+цен/i;
const supplierAdPattern = /\b(we are (a )?(supplier|manufacturer|factory)|our factory|shop now|free shipping|add to cart|job opening|hiring)\b|мы\s+производител/i;
const nonDemandPattern = /\b(appoints?|appointed|appointment|named\s+as|new\s+(?:ceo|md|director|manager)|joins?\s+as|promotion|press release|industry news|market report|edited|report this post|close menu|job opening|hiring)\b/i;
const pageDetailPattern = /\b(quantity required|buyer from|destination|shipping terms|product description|buying lead|buyer details|valid until|date posted|posted on|rfq\s*(?:id|no\.?))\b|страна\s+покупателя|объем\s+закупки/i;
const quantityPattern = /\b(?:quantity(?:\s+required)?|qty|order(?:\s+quantity)?|need|requirement)\s*[:\-]?\s*((?:\d[\d,.]*)(?:\s*(?:-|to)\s*\d[\d,.]*)?\s*(?:pieces?|pcs?|units?|dresses?|sets?|dozen|dozens)?)\b/i;
const countryPattern = /\b(?:buyer\s+from|destination\s*[:\-]?|country\s*[:\-]?)\s*([A-Z][A-Za-z '-]{2,34})(?=[.,;]|\s+(?:quantity|looking|seeking|need|requirement)\b|$)/i;

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();

function platformFromUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host.includes("go4worldbusiness")) return "go4WorldBusiness";
  if (host.includes("linkedin")) return "LinkedIn";
  if (host.includes("alibaba")) return "Alibaba RFQ";
  if (host.includes("tradekey")) return "TradeKey";
  if (host.includes("tradeindia")) return "TradeIndia";
  if (host.includes("exportersindia")) return "ExportersIndia";
  if (host.includes("optlist")) return "OptList";
  if (host.includes("qifa")) return "QIFA";
  return host;
}

export function isBuyerDemandDetailUrl(value: string | URL) {
  let url: URL;
  try { url = typeof value === "string" ? new URL(value) : value; } catch { return false; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/{2,}/g, "/");

  // go4WorldBusiness search/category pages contain many unrelated products in one
  // snippet. Only a numbered buy-lead detail page represents one auditable RFQ.
  if (host.includes("go4worldbusiness")) return /^\/buylead\/view\/\d+\//i.test(path);
  if (host === "sourcing.alibaba.com") return /\/rfq\//i.test(path) || /rfq_detail/i.test(path);
  if (host.includes("tradekey")) return /\/(?:buyoffer|buying-leads?)\//i.test(path);
  if (host.includes("tradeindia")) return /\/(?:buyoffer|buy-leads?)\//i.test(path);
  if (host.includes("exportersindia")) return /\/buy-leads?\//i.test(path);
  if (host.includes("linkedin")) return /\/posts\/[^/]+/i.test(path) || /\/feed\/update\/urn:li:activity:/i.test(path);

  // Unknown websites, news pages and search/category pages are not auditable RFQs.
  return false;
}

function parsedDate(value: string | undefined, now: Date) {
  if (!value) return null;
  const relative = value.match(/(\d+)\s+(day|week|month)s?\s+ago/i);
  if (relative) {
    const amount = Number(relative[1]);
    const multiplier = relative[2].toLowerCase() === "day" ? 1 : relative[2].toLowerCase() === "week" ? 7 : 30;
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - amount * multiplier);
    return date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function gradeFor(score: number): BuyerDemandLead["grade"] {
  return score >= 80 ? "A+" : score >= 70 ? "A" : "B";
}

function contactFromLinkedInTitle(title: string, platform: string) {
  if (platform !== "LinkedIn") return null;
  const name = title.split(/\s+[|–—-]\s+/)[0]?.trim();
  return name && name.length >= 2 && name.length <= 70 ? name : null;
}

export function qualifyBuyerDemand(
  result: SerperOrganicResult,
  now = new Date(),
  maxAgeDays = BUYER_DEMAND_MAX_AGE_DAYS,
): BuyerDemandLead | null {
  if (!result.title || !result.link) return null;
  let url: URL;
  try { url = new URL(result.link); } catch { return null; }
  const title = cleanText(result.title);
  const snippet = cleanText(result.snippet ?? "");
  const combined = `${title} ${snippet}`;
  // The product must be explicit in the title. Procurement intent may be in the
  // title or snippet because several RFQ platforms use product-only page titles.
  if (!productPattern.test(title) || !intentPattern.test(combined)) return null;
  if (supplierAdPattern.test(combined) || nonDemandPattern.test(combined)) return null;
  if (!isBuyerDemandDetailUrl(url)) return null;

  const platform = platformFromUrl(url);
  const published = parsedDate(result.date, now);
  const ageDays = published ? Math.max(0, Math.floor((now.getTime() - published.getTime()) / 86_400_000)) : null;
  if (ageDays !== null && ageDays > maxAgeDays) return null;
  const quantity = combined.match(quantityPattern)?.[1]?.trim() ?? null;
  const country = combined.match(countryPattern)?.[1]?.replace(/\s+(and|for|with)\b.*$/i, "").trim() ?? null;
  const contactName = contactFromLinkedInTitle(title, platform);
  const explicitRfq = /\b(rfq|quantity required|request for quotation|buying request|wanted)\b/i.test(combined);

  let score = 55 + (ageDays === null ? 5 : ageDays <= 30 ? 20 : ageDays <= 90 ? 12 : 5);
  if (quantity) score += 10;
  if (contactName || country) score += 7;
  if (explicitRfq) score += 3;
  score = Math.min(100, score);

  const identity = contactName ?? country ?? platform;
  const company = contactName ? `${contactName} · 采购需求` : `采购需求买家 · ${identity}`;
  const evidence = [
    `需求标题：${title}`,
    snippet ? `公开描述：${snippet}` : null,
    `来源平台：${platform}`,
    quantity ? `公开采购数量：${quantity}` : null,
    published ? `公开时间：${published.toISOString().slice(0, 10)}` : "公开时间：搜索结果未明确标注",
    country ? `买家地区：${country}` : null,
  ].filter((item): item is string => Boolean(item));
  const risks = [
    !contactName ? "平台未公开完整买家公司名称，审核时需打开原始需求确认身份" : null,
    !published ? "发布时间未明确，联系前需确认需求仍然有效" : null,
    !quantity ? "采购数量未公开，需进一步确认" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    sourceKey: `demand:${createHash("sha256").update(url.href).digest("hex").slice(0, 24)}`,
    company, country, customerType: "Active Buyer / Procurement Demand", score, grade: gradeFor(score),
    confidence: score >= 80 ? "high" : "medium",
    signals: ["explicit_purchase_demand", "evening_dress_focus", quantity ? "quantity_disclosed" : "quantity_pending"],
    evidence, risks,
    recommendation: "优先打开原始采购需求核实买方身份、截止日期与规格；确认有效后，以中国礼服产品开发、面料与稳定生产能力切入联系。",
    sourceUrl: url.href, platform, publishedAt: published?.toISOString() ?? null, quantity, contactName,
  };
}

function evidenceValue(evidence: unknown, prefix: string) {
  if (!Array.isArray(evidence)) return "";
  const line = evidence.find((item) => typeof item === "string" && item.startsWith(prefix));
  return typeof line === "string" ? line.slice(prefix.length).trim() : "";
}

export function isStoredBuyerDemandValid(row: { source_url?: string | null; evidence?: unknown }) {
  if (!row.source_url || !isBuyerDemandDetailUrl(row.source_url)) return false;
  const title = evidenceValue(row.evidence, "需求标题：");
  const description = evidenceValue(row.evidence, "公开描述：");
  if (!title || !productPattern.test(title) || !intentPattern.test(`${title} ${description}`)) return false;
  return !supplierAdPattern.test(`${title} ${description}`) && !nonDemandPattern.test(`${title} ${description}`);
}

function pageText(html: string) {
  return cleanText(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">"));
}

export async function verifyBuyerDemandSource(
  demand: BuyerDemandLead,
  fetcher: typeof fetch = fetch,
): Promise<BuyerDemandLead | null> {
  try {
    const response = await fetcher(demand.sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BingfengLeadVerifier/1.0)" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !isBuyerDemandDetailUrl(response.url || demand.sourceUrl)) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) return null;
    const text = pageText((await response.text()).slice(0, 1_500_000));
    if (text.length < 120 || /access denied|verify you are human|captcha|page not found|404 not found/i.test(text)) return null;
    if (!productPattern.test(text) || !intentPattern.test(text) || !pageDetailPattern.test(text)) return null;
    if (supplierAdPattern.test(text.slice(0, 6000)) || nonDemandPattern.test(text.slice(0, 6000))) return null;
    return {
      ...demand,
      score: Math.min(100, demand.score + 5),
      grade: gradeFor(Math.min(100, demand.score + 5)),
      confidence: demand.score + 5 >= 80 ? "high" : "medium",
      signals: [...new Set([...demand.signals, "source_page_verified"])],
      evidence: [...demand.evidence, "系统核验：已打开具体采购页，原文同时包含礼服产品、采购动作和询盘明细。"],
      risks: demand.risks.filter((risk) => !risk.includes("原始需求")),
    };
  } catch {
    return null;
  }
}

function serperErrorDetail(body: string) {
  if (!body.trim()) return "";
  try {
    const payload = JSON.parse(body) as { message?: unknown; error?: unknown };
    const nestedError = typeof payload.error === "object" && payload.error
      ? (payload.error as { message?: unknown }).message
      : payload.error;
    const detail = payload.message ?? nestedError;
    return typeof detail === "string" ? cleanText(detail).slice(0, 180) : "";
  } catch {
    return "";
  }
}

export function describeSerperFailure(status: number, body = "") {
  const detail = serperErrorDetail(body);
  const lowerDetail = detail.toLowerCase();
  if (/credit|quota|balance|insufficient/.test(lowerDetail)) {
    return "Serper 查询额度不足，请在 Serper 后台充值或更换有效 API Key。";
  }
  if (/api.?key|unauthori[sz]ed|invalid.?key/.test(lowerDetail) || status === 401 || status === 403) {
    return "Serper API Key 无效、已撤销或没有搜索权限，请检查 Vercel 环境变量 SERPER_API_KEY。";
  }
  if (status === 429) return "Serper 请求过于频繁，系统稍后重试即可。";
  if (status >= 500) return "Serper 搜索服务暂时不可用，请稍后重试。";
  if (status === 400) {
    return detail ? `Serper 拒绝了搜索条件（400）：${detail}` : "Serper 拒绝了搜索条件（400），请检查查询格式或账户额度。";
  }
  return detail ? `Serper 搜索失败（${status}）：${detail}` : `Serper 搜索失败（${status}）。`;
}

function lookbackDate(maxAgeDays: number, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - maxAgeDays);
  return date.toISOString().slice(0, 10);
}

async function runSerperQuery(query: string, apiKey: string, maxAgeDays = BUYER_DEMAND_MAX_AGE_DAYS) {
  // Use Google's broadly supported `after:` operator instead of Serper's optional tbs parameter.
  const datedQuery = `${query} after:${lookbackDate(maxAgeDays)}`;
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: datedQuery, gl: "us", hl: "en", num: 10 }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(describeSerperFailure(response.status, body));
  let payload: SerperResponse;
  try {
    payload = JSON.parse(body) as SerperResponse;
  } catch {
    throw new Error("Serper 返回了无法解析的数据，请稍后重试。");
  }
  if (payload.message) throw new Error(payload.message);
  return payload.organic ?? [];
}

export async function searchBuyerDemands(
  mode: BuyerDemandSearchMode = "incremental",
): Promise<BuyerDemandSearchResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("尚未配置 SERPER_API_KEY。");
  const now = new Date();
  // Both initial database creation and daily incremental monitoring only keep
  // demands from the latest 60 days. Bootstrap expands source coverage; it does
  // not make stale procurement requests eligible again.
  const maxAgeDays = BUYER_DEMAND_MAX_AGE_DAYS;
  const queries = mode === "bootstrap" ? bootstrapSearchQueries : incrementalSearchQueries;
  const responses: SerperOrganicResult[][] = [];
  const warnings: string[] = [];
  let successfulQueries = 0;
  for (let index = 0; index < queries.length; index += 2) {
    const batch = await Promise.allSettled(
      queries.slice(index, index + 2).map((query) => runSerperQuery(query, apiKey, maxAgeDays)),
    );
    batch.forEach((result, batchIndex) => {
      if (result.status === "fulfilled") {
        successfulQueries += 1;
        responses.push(result.value);
      } else {
        const queryNumber = index + batchIndex + 1;
        const reason = result.reason instanceof Error ? result.reason.message : "未知搜索错误";
        warnings.push(`第 ${queryNumber} 组搜索失败：${reason}`);
      }
    });
  }
  if (!successfulQueries) throw new Error(warnings[0] ?? "全部采购需求搜索均失败，请稍后重试。");
  const unique = new Map<string, BuyerDemandLead>();
  const rawResults = responses.flat();
  rawResults.forEach((result) => {
    const demand = qualifyBuyerDemand(result, now, maxAgeDays);
    if (!demand || demand.score < 60) return;
    const current = unique.get(demand.sourceKey);
    if (!current || demand.score > current.score) unique.set(demand.sourceKey, demand);
  });
  const candidates = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 24);
  const verified = await Promise.all(candidates.map((demand) => verifyBuyerDemandSource(demand)));
  const demands = verified.filter((demand): demand is BuyerDemandLead => Boolean(demand));
  return {
    demands: demands.sort((a, b) => b.score - a.score),
    warnings,
    searchQueryCount: queries.length,
    rawResultsCount: rawResults.length,
    qualifiedCandidatesCount: candidates.length,
    successfulQueries,
    failedQueries: warnings.length,
    verificationRejectedCount: candidates.length - demands.length,
  };
}
