import type { Customer } from "@/types/database";

export const CUSTOMER_RESEARCH_FRESH_DAYS = 7;
export const CUSTOMER_SIGNAL_MAX_AGE_DAYS = 180;

export type ResearchCustomer = Pick<
  Customer,
  "id" | "company" | "website" | "country" | "customer_type" | "product_category" | "priority"
>;

export type ResearchSignal = {
  customer_id: string;
  title: string;
  summary: string | null;
  source_url: string;
  signal_type: "news" | "website_update";
  relevance_score: number;
  published_at: string | null;
  created_at: string;
};

type SerperItem = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  source?: string;
};

type SerperResponse = {
  news?: SerperItem[];
  organic?: SerperItem[];
};

const legalSuffixes = new Set([
  "and", "company", "co", "corp", "corporation", "group", "inc", "international",
  "limited", "ltd", "llc", "official", "shop", "store", "the", "website",
]);

const commercialPatterns = [
  /new (?:collection|season|range|line|launch)|collection launch|spring|summer|autumn|fall|winter/i,
  /expand|expansion|new store|opening|growth|partnership|distribution|collaboration/i,
  /supplier|sourcing|supply chain|production|manufacturer|procurement|import/i,
  /evening|occasion|formalwear|gown|dress|fashion|boutique|couture|bridal/i,
  /market|trend|customer demand|retail|wholesale|trade show|fashion week/i,
];

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function customerDomain(website: string | null | undefined) {
  const raw = (website || "").trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./, "").toLowerCase();
  }
}

function companyTokens(company: string) {
  return normalize(company).split(" ").filter((token) => token.length >= 3 && !legalSuffixes.has(token));
}

function normalizedSourceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]
      .forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return value.trim();
  }
}

function hostMatches(link: string, domain: string) {
  if (!domain) return false;
  try {
    const host = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

export function isCustomerResearchMatch(item: SerperItem, customer: ResearchCustomer) {
  if (!item.link || !item.title) return false;
  const domain = customerDomain(customer.website);
  if (hostMatches(item.link, domain)) return true;
  const tokens = companyTokens(customer.company);
  if (!tokens.length) return false;
  const text = normalize(`${item.title} ${item.snippet || ""} ${item.source || ""}`);
  const hits = tokens.filter((token) => text.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

export function parseResearchDate(value: string | null | undefined, now = new Date()) {
  const raw = (value || "").trim();
  if (!raw) return null;
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  const relative = raw.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!relative) return null;
  const amount = Number(relative[1]);
  const units: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 7 * 86_400_000,
    month: 30 * 86_400_000,
    year: 365 * 86_400_000,
  };
  return new Date(now.getTime() - amount * units[relative[2].toLowerCase()]).toISOString();
}

export function scoreResearchItem(item: SerperItem, customer: ResearchCustomer, now = new Date()) {
  const text = `${item.title || ""} ${item.snippet || ""}`;
  const domainMatch = item.link ? hostMatches(item.link, customerDomain(customer.website)) : false;
  const patternHits = commercialPatterns.filter((pattern) => pattern.test(text)).length;
  const publishedAt = parseResearchDate(item.date, now);
  const ageDays = publishedAt ? (now.getTime() - new Date(publishedAt).getTime()) / 86_400_000 : null;
  return Math.min(100, 28 + (domainMatch ? 24 : 14) + Math.min(36, patternHits * 12) + (ageDays !== null && ageDays <= 60 ? 12 : 0));
}

async function serperRequest(endpoint: "news" | "search", body: Record<string, unknown>, apiKey: string) {
  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Serper ${endpoint} request failed (${response.status})`);
  return response.json() as Promise<SerperResponse>;
}

export async function researchCustomerSignals(customer: ResearchCustomer, apiKey: string, now = new Date()) {
  const domain = customerDomain(customer.website);
  const businessContext = [customer.customer_type, customer.product_category, customer.country].filter(Boolean).join(" ");
  const newsQuery = `"${customer.company}" ${businessContext} (collection OR expansion OR partnership OR sourcing OR production OR occasionwear)`;
  const websiteQuery = domain
    ? `site:${domain} (collection OR occasionwear OR evening dresses OR news OR partnership OR stores)`
    : `"${customer.company}" official website ${businessContext}`;
  const settled = await Promise.allSettled([
    serperRequest("news", { q: newsQuery, num: 8, hl: "en" }, apiKey),
    serperRequest("search", { q: websiteQuery, num: 8, hl: "en", tbs: "qdr:y" }, apiKey),
  ]);
  const candidates = settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const items = index === 0 ? result.value.news ?? [] : result.value.organic ?? [];
    return items.map((item) => ({ item, signalType: index === 0 ? "news" as const : "website_update" as const }));
  });
  if (!candidates.length && settled.every((result) => result.status === "rejected")) {
    throw new Error("客户动态检索暂时不可用。");
  }

  const unique = new Map<string, ResearchSignal>();
  for (const { item, signalType } of candidates) {
    if (!isCustomerResearchMatch(item, customer) || !item.link || !item.title) continue;
    const publishedAt = parseResearchDate(item.date, now);
    if (publishedAt && now.getTime() - new Date(publishedAt).getTime() > CUSTOMER_SIGNAL_MAX_AGE_DAYS * 86_400_000) continue;
    const relevanceScore = scoreResearchItem(item, customer, now);
    if (relevanceScore < 54) continue;
    const sourceUrl = normalizedSourceUrl(item.link);
    const signal: ResearchSignal = {
      customer_id: customer.id,
      title: item.title.trim().slice(0, 500),
      summary: item.snippet?.trim().slice(0, 1600) || null,
      source_url: sourceUrl,
      signal_type: signalType,
      relevance_score: relevanceScore,
      published_at: publishedAt,
      created_at: now.toISOString(),
    };
    const existing = unique.get(sourceUrl);
    if (!existing || signal.relevance_score > existing.relevance_score) unique.set(sourceUrl, signal);
  }
  return [...unique.values()].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 8);
}

export function isResearchFresh(createdAt: string | null | undefined, now = new Date()) {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  return !Number.isNaN(timestamp) && now.getTime() - timestamp <= CUSTOMER_RESEARCH_FRESH_DAYS * 86_400_000;
}

export function selectFreshCustomerSignals<T extends { published_at?: string | null; created_at?: string | null }>(
  signals: T[],
  now = new Date(),
) {
  return signals.filter((signal) => {
    const timestamp = Date.parse(signal.published_at || signal.created_at || "");
    return !Number.isNaN(timestamp)
      && now.getTime() - timestamp <= CUSTOMER_SIGNAL_MAX_AGE_DAYS * 86_400_000;
  });
}
