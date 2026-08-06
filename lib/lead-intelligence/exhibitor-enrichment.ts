
import { scoreLead } from "./score";
import type { BuyerSignal, ScoredLead } from "./types";

type OrganicResult = { title?: string; link?: string; snippet?: string };
type SerperResponse = { organic?: OrganicResult[]; message?: string };

export type ExhibitorSeed = { company: string; website?: string; text?: string };

export type EnrichedExhibitor = ScoredLead & {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  address: string;
  contactSources: string[];
  dataCompleteness: number;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+?\d[\d\s()./-]{7,}\d)/g;
const socialHosts = ["instagram.com", "facebook.com", "linkedin.com", "tiktok.com", "youtube.com"];
const genericCompanyWords = new Set([
  "fashion", "couture", "moda", "abiye", "dress", "dresses", "collection",
  "exclusive", "textile", "tekstil", "bridal", "giyim", "group", "grup",
]);

function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resultHost(result: OrganicResult) {
  try { return new URL(result.link ?? "").hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function relevantToCompany(seed: ExhibitorSeed, hostname: string, result: OrganicResult) {
  const host = resultHost(result);
  if (hostname && (host === hostname || host.endsWith(`.${hostname}`))) return true;
  const haystack = normalizeSearchText(`${result.title ?? ""} ${result.link ?? ""} ${result.snippet ?? ""}`);
  const exactName = normalizeSearchText(seed.company);
  return exactName.length >= 4 && haystack.includes(exactName);
}

function officialHostMatchesCompany(seed: ExhibitorSeed, result: OrganicResult) {
  const host = normalizeSearchText(resultHost(result)).replace(/\s+/g, "");
  if (!host || socialHosts.some((social) => host.includes(social.replace(/\W/g, "")))) return false;
  const tokens = normalizeSearchText(seed.company).split(" ")
    .filter((token) => token.length >= 4 && !genericCompanyWords.has(token));
  return tokens.length ? tokens.some((token) => host.includes(token)) : host.includes(normalizeSearchText(seed.company).replace(/\s+/g, ""));
}

function cleanWebsite(value?: string) {
  if (!value || value === "http://" || value === "https://") return "";
  try {
    const url = new URL(value);
    if (!url.hostname) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function normalizePhone(value: string) {
  const compact = value.replace(/\s+/g, " ").trim().replace(/^[.\-/]+|[.\-/]+$/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return "";
  if (digits.length === 13 && /^(978|979)/.test(digits)) return "";
  if (/^(19|20)\d{6,}$/.test(digits)) return "";
  return compact;
}

function socialUrl(results: OrganicResult[], host: string) {
  return results.find((result) => {
    try { return new URL(result.link ?? "").hostname.toLowerCase().includes(host); } catch { return false; }
  })?.link ?? "";
}

async function serperSearch(query: string): Promise<OrganicResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("尚未配置 SERPER_API_KEY。");
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "tr", hl: "en", location: "Turkey", num: 10 }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Serper 搜索失败（${response.status}）。`);
  const payload = (await response.json()) as SerperResponse;
  if (payload.message) throw new Error(payload.message);
  return payload.organic ?? [];
}

async function safeSerperSearch(query: string): Promise<OrganicResult[]> {
  try {
    return await Promise.race([
      serperSearch(query),
      new Promise<OrganicResult[]>((resolve) => setTimeout(() => resolve([]), 12_000)),
    ]);
  } catch {
    return [];
  }
}

export async function enrichExhibitor(seed: ExhibitorSeed): Promise<EnrichedExhibitor> {
  const website = cleanWebsite(seed.website);
  const hostname = website ? new URL(website).hostname.replace(/^www\./, "") : "";
  const queries = [
    `"${seed.company}" (contact OR iletişim OR email OR phone OR WhatsApp OR Instagram) evening dress`,
    `"${seed.company}" "Firma Yetkilisi" "Ürün Grupları"`,
    hostname ? `site:${hostname} (contact OR iletişim OR email OR phone OR WhatsApp)` : `"${seed.company}" Turkey official website`,
  ];
  const batches = await Promise.all(queries.map((query) => safeSerperSearch(query)));
  const results = batches.flat();
  const relevantResults = results.filter((result) => relevantToCompany(seed, hostname, result));
  const sourceUrls = unique(relevantResults.map((result) => result.link)).slice(0, 12);
  const combined = relevantResults.map((result) => `${result.title ?? ""} ${result.snippet ?? ""}`).join("\n");
  const emails = unique(combined.match(emailPattern) ?? []).filter((email) => !email.endsWith("@example.com"));
  const phones = unique((combined.match(phonePattern) ?? []).map(normalizePhone)).filter(Boolean);
  const instagram = socialUrl(relevantResults, "instagram.com");
  const facebook = socialUrl(relevantResults, "facebook.com");
  const linkedin = socialUrl(relevantResults, "linkedin.com");
  const whatsappLink = relevantResults.find((result) => /wa\.me|whatsapp/i.test(`${result.link} ${result.title} ${result.snippet}`));
  const whatsappText = `${whatsappLink?.title ?? ""} ${whatsappLink?.snippet ?? ""}`;
  const whatsapp = unique((whatsappText.match(phonePattern) ?? []).map(normalizePhone)).filter(Boolean)[0] ?? "";
  const officialResult = relevantResults.find((result) => {
    try {
      const host = new URL(result.link ?? "").hostname.replace(/^www\./, "");
      return hostname ? host === hostname || host.endsWith(`.${hostname}`) : officialHostMatchesCompany(seed, result);
    } catch { return false; }
  });
  const resolvedWebsite = website || (officialResult?.link ? cleanWebsite(officialResult.link) : "");
  const signals: BuyerSignal[] = ["evening_dress_focus"];
  if (/luxury|premium|couture|exclusive|designer|haute/i.test(combined + seed.company)) signals.push("premium_positioning");
  if (/wholesale|toptan|manufacturer|üretici|ihracat|export|distributor/i.test(combined)) signals.push("wholesale");
  if (/multi[- ]brand|çok markalı|designer brands|brands we carry/i.test(combined)) signals.push("multi_brand");
  if (/\bimport(?:er|ing)?\b|ithalat|international sourcing/i.test(combined)) signals.push("importer");
  if (/international|global|export countries|ihracat|worldwide/i.test(combined)) signals.push("international_brands");
  if (/showroom|store|stores|mağaza|boutique|locations/i.test(combined)) signals.push("physical_stores");
  if (instagram || facebook || linkedin) signals.push("active_social");
  const evidence = unique(relevantResults.slice(0, 8).map((result) => [result.title, result.snippet].filter(Boolean).join(" — "))).slice(0, 8);
  const candidate = scoreLead({
    id: `if-wedding-2026:${seed.company.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`,
    company: seed.company,
    website: resolvedWebsite,
    country: "Turkey",
    city: /İzmir|Izmir/i.test(combined) ? "İzmir" : /Ankara/i.test(combined) ? "Ankara" : /İstanbul|Istanbul/i.test(combined) ? "İstanbul" : "",
    customerType: signals.includes("multi_brand") ? "Multi-brand Retailer / Exhibitor" : signals.includes("wholesale") ? "Evening Dress Manufacturer / Exporter" : "Evening Dress Exhibitor",
    description: evidence[0] || `${seed.company} — IF Wedding Fashion İzmir 2026 exhibitor`,
    sourceUrl: "https://ifwedding.izfas.com.tr/participant-list?tab=48738",
    signals: unique(signals) as BuyerSignal[],
    evidence: [`IF Wedding Fashion İzmir 2026 B Hall official exhibitor list`, ...evidence],
  });
  const contactEmail = emails[0] ?? "";
  const contactPhone = phones[0] ?? "";
  const contactEvidence = [
    contactEmail ? `公开邮箱：${contactEmail}` : "",
    contactPhone ? `公开电话：${contactPhone}` : "",
    whatsapp ? `WhatsApp：${whatsapp}` : "",
    instagram ? `Instagram：${instagram}` : "",
    facebook ? `Facebook：${facebook}` : "",
    linkedin ? `LinkedIn：${linkedin}` : "",
  ].filter(Boolean);
  const completeness = Math.min(100,
    (resolvedWebsite ? 20 : 0) + (contactEmail ? 30 : 0) + (contactPhone ? 25 : 0) +
    (whatsapp ? 10 : 0) + (instagram ? 10 : 0) + (sourceUrls.length >= 3 ? 5 : 0));
  return {
    ...candidate,
    evidence: [candidate.evidence[0], ...contactEvidence, ...candidate.evidence.slice(1)],
    contactName: "",
    contactEmail,
    contactPhone,
    whatsapp,
    instagram,
    facebook,
    linkedin,
    address: "",
    contactSources: sourceUrls,
    dataCompleteness: completeness,
  };
}

