import { createHash } from "node:crypto";

type SerperOrganicResult = { title?: string; link?: string; snippet?: string; date?: string };
type SerperResponse = { organic?: SerperOrganicResult[]; message?: string };

export type BuyerDemandLead = {
  sourceKey: string; company: string; country: string | null; customerType: string;
  score: number; grade: "A+" | "A" | "B"; confidence: "high" | "medium";
  signals: string[]; evidence: string[]; risks: string[]; recommendation: string;
  sourceUrl: string; platform: string; publishedAt: string | null; quantity: string | null;
  contactName: string | null;
};

const searchQueries = [
  'site:go4worldbusiness.com/buyers ("evening dress" OR "evening wear" OR "prom dress" OR "formal gown") (wanted OR "quantity required")',
  '(RFQ OR "buying request" OR "looking for supplier") ("evening dresses" OR "prom dresses" OR "formal gowns" OR occasionwear) wholesale',
  '("looking for" OR seeking) ("evening dress manufacturer" OR "formalwear supplier" OR "private label prom dress")',
  '("ищу поставщика" OR "закупаем" OR "оптом требуется") ("вечерние платья" OR "платья для выпускного")',
];

const productPattern = /\b(evening\s*(dress|wear|gown)s?|prom\s*(dress|gown)s?|formal\s*(dress|wear|gown)s?|occasion\s*wear|cocktail\s*dresses|ball\s*gowns?|mother[- ]of[- ]the[- ]bride|beaded\s*gowns?|sequin\s*dresses)\b|вечерн\w*\s+плать\w*|плать\w*\s+для\s+выпускн\w*/i;
const intentPattern = /\b(wanted|want to buy|buying request|purchase requirement|quantity required|request for quotation|rfq|looking for (a )?(supplier|manufacturer|vendor)|seeking (a )?(supplier|manufacturer|vendor)|need (a )?(supplier|manufacturer)|sourcing (a )?(supplier|manufacturer))\b|ищу\s+поставщик\w*|закупаем|оптом\s+требуется|запрос\s+цен/i;
const supplierAdPattern = /\b(we are (a )?(supplier|manufacturer|factory)|our factory|shop now|free shipping|add to cart|job opening|hiring)\b|мы\s+производител/i;
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

export function qualifyBuyerDemand(result: SerperOrganicResult, now = new Date()): BuyerDemandLead | null {
  if (!result.title || !result.link) return null;
  let url: URL;
  try { url = new URL(result.link); } catch { return null; }
  const title = cleanText(result.title);
  const snippet = cleanText(result.snippet ?? "");
  const combined = `${title} ${snippet}`;
  if (!productPattern.test(combined) || !intentPattern.test(combined) || supplierAdPattern.test(combined)) return null;

  const platform = platformFromUrl(url);
  const published = parsedDate(result.date, now);
  const ageDays = published ? Math.max(0, Math.floor((now.getTime() - published.getTime()) / 86_400_000)) : null;
  if (ageDays !== null && ageDays > 180) return null;
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

export async function searchBuyerDemands() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("尚未配置 SERPER_API_KEY。");
  const responses: SerperOrganicResult[][] = [];
  for (let index = 0; index < searchQueries.length; index += 2) {
    const batch = await Promise.all(searchQueries.slice(index, index + 2).map(async (query) => {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "us", hl: "en", num: 10, tbs: "qdr:m6" }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`采购需求搜索失败（${response.status}）。`);
      const payload = await response.json() as SerperResponse;
      if (payload.message) throw new Error(payload.message);
      return payload.organic ?? [];
    }));
    responses.push(...batch);
  }
  const unique = new Map<string, BuyerDemandLead>();
  responses.flat().forEach((result) => {
    const demand = qualifyBuyerDemand(result);
    if (!demand || demand.score < 60) return;
    const current = unique.get(demand.sourceKey);
    if (!current || demand.score > current.score) unique.set(demand.sourceKey, demand);
  });
  return [...unique.values()].sort((a, b) => b.score - a.score);
}
