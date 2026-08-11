type OrganicResult = { title?: string; link?: string; snippet?: string };

export type CustomsSeed = {
  company: string;
  country: string;
  shipment_count: number;
  first_import_date: string;
  latest_import_date: string;
  product_descriptions: string[];
};

export type CustomsEnrichment = {
  website: string;
  sourceUrl: string;
  contactEmail: string;
  contactPhone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  customerType: string;
  evidence: string[];
  risks: string[];
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  dataCompleteness: number;
  shouldImport: boolean;
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+?\d[\d\s()./-]{7,}\d)/g;
const rejectedHosts = ["facebook.com", "instagram.com", "linkedin.com", "youtube.com", "wikipedia.org", "importgenius.com", "panjiva.com", "volza.com"];

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function host(value?: string) {
  try { return new URL(value ?? "").hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function cleanOrigin(value?: string) {
  try { return new URL(value ?? "").origin; } catch { return ""; }
}

function normalizePhone(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim().replace(/^[./-]+|[./-]+$/g, "");
  const digits = cleaned.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? cleaned : "";
}

async function search(query: string, country: string): Promise<OrganicResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, hl: "en", num: 10, location: country || undefined }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { organic?: OrganicResult[] };
    return payload.organic ?? [];
  } catch {
    return [];
  }
}

function companyTokens(company: string) {
  const ignored = new Set(["inc", "llc", "ltd", "limited", "corp", "corporation", "company", "co", "the", "and", "of"]);
  return company.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 3 && !ignored.has(part));
}

function isRelevant(seed: CustomsSeed, result: OrganicResult) {
  const text = `${result.title ?? ""} ${result.link ?? ""} ${result.snippet ?? ""}`.toLowerCase();
  const tokens = companyTokens(seed.company);
  return tokens.length > 0 && tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length);
}

export async function enrichCustomsLead(seed: CustomsSeed): Promise<CustomsEnrichment> {
  const queries = [
    `"${seed.company}" ${seed.country} (official OR website OR contact)`,
    `"${seed.company}" (evening dress OR prom dress OR formalwear OR apparel) (email OR phone OR contact)`,
  ];
  const results = (await Promise.all(queries.map((query) => search(query, seed.country)))).flat();
  const relevant = results.filter((result) => isRelevant(seed, result));
  const combined = relevant.map((result) => `${result.title ?? ""} ${result.snippet ?? ""}`).join("\n");
  const official = relevant.find((result) => {
    const domain = host(result.link);
    return domain && !rejectedHosts.some((blocked) => domain.includes(blocked));
  });
  const website = cleanOrigin(official?.link);
  const emails = unique(combined.match(emailPattern) ?? []).filter((email) => !/example\.|sentry\.|wixpress/i.test(email));
  const phones = unique((combined.match(phonePattern) ?? []).map(normalizePhone)).filter(Boolean);
  const social = (domain: string) => relevant.find((result) => host(result.link).includes(domain))?.link ?? "";
  const apparel = /evening|prom|formal|gown|dress|apparel|fashion|boutique|bridal|occasion/i.test(combined);
  const logistics = /logistics|freight|cargo|forwarding|customs broker|warehouse/i.test(`${seed.company} ${combined}`);
  const retailer = /retail|store|shop|boutique|stockist|department store|e-?commerce/i.test(combined);
  const brand = /brand|designer|collection|fashion house|label/i.test(combined);
  const importer = /import|wholesale|distribut|sourcing|trading/i.test(combined);
  const customerType = retailer ? "Fashion Retailer / Boutique" : brand ? "Evening Dress Brand / Apparel Company" : importer ? "Apparel Importer / Distributor" : logistics ? "Logistics / Import Agent (needs verification)" : "Customs Importer (needs verification)";
  let score = 42;
  score += Math.min(20, seed.shipment_count * 3);
  if (seed.latest_import_date >= "2025-01-01") score += 12;
  else if (seed.latest_import_date >= "2023-01-01") score += 6;
  if (apparel) score += 12;
  if (website) score += 6;
  if (emails.length || phones.length) score += 5;
  if (retailer || brand || importer) score += 5;
  if (logistics && !apparel) score -= 25;
  if (!relevant.length) score -= 8;
  score = Math.max(20, Math.min(96, score));
  const grade = score >= 80 ? "A+" : score >= 65 ? "A" : score >= 45 ? "B" : score >= 30 ? "C" : "D";
  const evidence = [
    `海关记录：${seed.shipment_count} 次；首次 ${seed.first_import_date}；最近 ${seed.latest_import_date}`,
    ...relevant.slice(0, 5).map((result) => [result.title, result.snippet, result.link].filter(Boolean).join(" — ")),
  ];
  const risks = [
    logistics ? "企业可能是物流/进口代理，需审核确认是否为实际采购方" : "",
    !apparel ? "公开网页尚未确认礼服经营背景，需人工核实" : "",
    !website ? "尚未确认官方网站" : "",
  ].filter(Boolean);
  const dataCompleteness = Math.min(100, 35 + (website ? 20 : 0) + (emails.length ? 20 : 0) + (phones.length ? 15 : 0) + (relevant.length >= 2 ? 10 : 0));
  return {
    website,
    sourceUrl: official?.link ?? relevant[0]?.link ?? "",
    contactEmail: emails[0] ?? "",
    contactPhone: phones[0] ?? "",
    whatsapp: /whatsapp/i.test(combined) ? phones[0] ?? "" : "",
    instagram: social("instagram.com"),
    facebook: social("facebook.com"),
    linkedin: social("linkedin.com"),
    customerType,
    evidence,
    risks,
    score,
    grade,
    dataCompleteness,
    shouldImport: score >= 35 || seed.shipment_count >= 2,
  };
}

