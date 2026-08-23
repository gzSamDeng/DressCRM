import type { BuyerSignal, LeadCandidate } from "./types";

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type SerperResponse = {
  organic?: SerperOrganicResult[];
  message?: string;
};

export type MarketSearchQuery = {
  query: string;
  country: string;
  gl: string;
  location: string;
};

const signalPatterns: Array<[BuyerSignal, RegExp]> = [
  ["importer", /\b(import|importer|ithalat|international sourcing|global sourcing)\b/i],
  ["retailer_or_boutique", /\b(boutique|retailer|retail store|dress shop|fashion brand|stockist)\b/i],
  ["multi_brand", /\b(multi[- ]brand|designer brands|brands we carry|our brands)\b/i],
  ["premium_positioning", /\b(luxury|premium|designer|couture|exclusive|high[- ]end)\b/i],
  ["evening_dress_focus", /\b(evening|occasion|gala|prom|abiye|gece elbisesi|cocktail dress)\b/i],
  ["wholesale", /\b(wholesale|toptan|distributor|distribution|trade|retail partners)\b/i],
  ["international_brands", /\b(international brands|global brands|designer labels)\b/i],
  ["physical_stores", /\b(store|stores|showroom|boutique|locations)\b/i],
  ["active_social", /\b(instagram|facebook|tiktok|social)\b/i],
];

const blockedHosts = [
  "instagram.com", "facebook.com", "youtube.com", "tiktok.com", "pinterest.com",
  "linkedin.com", "x.com", "twitter.com", "amazon.", "aliexpress.", "trendyol.",
  "hepsiburada.", "wikipedia.org",
];

function companyFromTitle(title: string, hostname: string) {
  const name = title.split(/\s+[|–—-]\s+/)[0]?.trim();
  if (name && name.length >= 2 && name.length <= 80) return name;
  return hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ");
}

export function candidateFromSerperResult(result: SerperOrganicResult, country: string): LeadCandidate | null {
  if (!result.link || !result.title) return null;

  let url: URL;
  try {
    url = new URL(result.link);
  } catch {
    return null;
  }

  const text = `${result.title} ${result.snippet ?? ""}`;
  const signals = signalPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([signal]) => signal);

  if (!signals.includes("evening_dress_focus") && !signals.includes("premium_positioning")) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (blockedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`) || hostname.includes(host))) {
    return null;
  }
  return {
    id: hostname,
    company: companyFromTitle(result.title, hostname),
    website: url.origin,
    country,
    city: "",
    customerType: signals.includes("wholesale")
      ? "Importer / Distributor"
      : signals.includes("multi_brand")
        ? "Multi-brand Retailer"
        : signals.includes("retailer_or_boutique")
          ? "Evening Dress Brand / Retailer"
          : "Fashion Company",
    description: result.snippet ?? result.title,
    sourceUrl: result.link,
    signals,
    evidence: [result.title, result.snippet].filter(
      (value): value is string => Boolean(value),
    ),
  };
}

export async function searchWithSerper(
  queries: MarketSearchQuery[],
  options: { pagesPerQuery?: number } = {},
) {
  const pagesPerQuery = Math.max(1, Math.min(3, Math.floor(options.pagesPerQuery ?? 2)));
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("尚未配置 SERPER_API_KEY。");

  const tasks = queries.flatMap((marketQuery) =>
    Array.from({ length: pagesPerQuery }, (_, index) => ({ ...marketQuery, page: index + 1 })),
  );
  const responses: Array<{ country: string; results: SerperOrganicResult[] }> = [];
  for (let index = 0; index < tasks.length; index += 5) {
    const batch = await Promise.all(
      tasks.slice(index, index + 5).map(async ({ query, country, gl, location, page }) => {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: query,
            gl,
            hl: "en",
            location,
            num: 10,
            page,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status !== 429) break;
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }

      if (!response) throw new Error("Serper 搜索没有返回响应。");
      if (!response.ok) {
        const errorBody = await response.text();
        let detail = errorBody.trim();
        try {
          const parsed = JSON.parse(errorBody) as { message?: string; error?: string };
          detail = parsed.message ?? parsed.error ?? detail;
        } catch {
          // Keep the plain-text response when Serper does not return JSON.
        }
        const safeDetail = detail.slice(0, 180);
        throw new Error(
          `Serper 搜索请求失败（${response.status}）${safeDetail ? `：${safeDetail}` : "。"}`
        );
      }

      const data = (await response.json()) as SerperResponse;
      if (data.message) throw new Error(data.message);
      return { country, results: data.organic ?? [] };
      }),
    );
    responses.push(...batch);
  }

  const unique = new Map<string, LeadCandidate>();
  responses.forEach(({ country, results }) => {
    results.forEach((result) => {
      const candidate = candidateFromSerperResult(result, country);
      if (!candidate) return;
      const existing = unique.get(candidate.id);
      if (!existing || candidate.signals.length > existing.signals.length) {
        unique.set(candidate.id, candidate);
      }
    });
  });

  return [...unique.values()];
}
