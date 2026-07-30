import type { BuyerSignal, LeadCandidate } from "./types";

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type SerpApiResponse = {
  organic_results?: SerpApiOrganicResult[];
  error?: string;
};

const signalPatterns: Array<[BuyerSignal, RegExp]> = [
  ["importer", /\b(import|importer|international sourcing|global sourcing)\b/i],
  ["multi_brand", /\b(multi[- ]brand|designer brands|brands we carry|our brands)\b/i],
  ["premium_positioning", /\b(luxury|premium|designer|couture|exclusive|high[- ]end)\b/i],
  ["evening_dress_focus", /\b(evening|occasion|gala|prom|abiye|cocktail dress)\b/i],
  ["wholesale", /\b(wholesale|distributor|distribution|trade|retail partners)\b/i],
  ["international_brands", /\b(international brands|global brands|designer labels)\b/i],
  ["physical_stores", /\b(store|stores|showroom|boutique|locations)\b/i],
  ["active_social", /\b(instagram|facebook|tiktok|social)\b/i],
];

function companyFromTitle(title: string, hostname: string) {
  const name = title.split(/\s+[|–—-]\s+/)[0]?.trim();
  if (name && name.length >= 2 && name.length <= 80) return name;
  return hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ");
}

function toCandidate(result: SerpApiOrganicResult): LeadCandidate | null {
  if (!result.link || !result.title) return null;
  let url: URL;
  try {
    url = new URL(result.link);
  } catch {
    return null;
  }
  const text = `${result.title} ${result.snippet ?? ""}`;
  const signals = signalPatterns.filter(([, pattern]) => pattern.test(text)).map(([signal]) => signal);
  if (!signals.includes("evening_dress_focus") && !signals.includes("premium_positioning")) return null;
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  return {
    id: hostname,
    company: companyFromTitle(result.title, hostname),
    website: url.origin,
    country: "Turkey",
    city: "",
    customerType: signals.includes("wholesale")
      ? "Importer / Distributor"
      : signals.includes("multi_brand")
        ? "Multi-brand Retailer"
        : "Fashion Retailer",
    description: result.snippet ?? result.title,
    sourceUrl: result.link,
    signals,
    evidence: [result.title, result.snippet].filter((value): value is string => Boolean(value)),
  };
}

export async function searchWithSerpApi(queries: string[]) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("尚未配置 SERPAPI_API_KEY。");

  const responses = await Promise.all(
    queries.map(async (query) => {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google");
      url.searchParams.set("q", query);
      url.searchParams.set("location", "Turkey");
      url.searchParams.set("hl", "en");
      url.searchParams.set("gl", "tr");
      url.searchParams.set("num", "10");
      url.searchParams.set("api_key", apiKey);
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`SerpApi 请求失败（${response.status}）。`);
      const data = (await response.json()) as SerpApiResponse;
      if (data.error) throw new Error(data.error);
      return data.organic_results ?? [];
    }),
  );

  const unique = new Map<string, LeadCandidate>();
  responses.flat().forEach((result) => {
    const candidate = toCandidate(result);
    if (!candidate) return;
    const existing = unique.get(candidate.id);
    if (!existing || candidate.signals.length > existing.signals.length) unique.set(candidate.id, candidate);
  });
  return [...unique.values()];
}
