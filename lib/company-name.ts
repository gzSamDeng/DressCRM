export type CompanyNameInput = {
  company: string | null | undefined;
  website: string | null | undefined;
  city?: string | null | undefined;
};

const publicSuffixPairs = new Set([
  "co.uk", "org.uk", "com.au", "net.au", "co.nz", "com.br", "com.mx",
  "com.tr", "com.sa", "com.sg", "com.hk", "com.cn", "co.jp", "co.kr",
  "co.za", "com.ar", "com.co", "com.ua", "com.pl", "com.ro",
]);

const genericTitlePatterns = [
  /^(?:buy|shop|discover|explore|browse|find)\b/i,
  /^(?:women'?s|ladies|girls|men'?s)\b/i,
  /^(?:long|evening|formal|prom|party|cocktail|wedding|occasion|designer)\s+(?:dress(?:es)?|gowns?|wear|clothing)\b/i,
  /^(?:fast|free|express|worldwide|next[- ]day)\s+(?:shipping|delivery)\b/i,
  /\b(?:dresses?|gowns?|clothing|fashion)\s+online\b/i,
  /\b(?:free|fast|express|worldwide)\s+(?:shipping|delivery)\b/i,
  /\b(?:new arrivals?|shop now|official site|latest collection|up to \d+% off)\b/i,
  /\b(?:in|for)\s+(?:uae|uk|usa|canada|australia|saudi arabia|united arab emirates)\s*$/i,
];

const embeddedWordTokens = [
  "barcelona", "istanbul", "london", "paris", "dubai", "sydney", "miami",
  "melbourne", "fashion", "boutique", "bridal", "couture", "dresses", "dress",
  "gowns", "gown", "closet", "stores", "store", "studio", "designs", "design",
  "style", "styles", "wear", "moda", "mode",
].sort((left, right) => right.length - left.length);

function clean(value: string | null | undefined) {
  return (value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function hostFromWebsite(website: string | null | undefined) {
  const raw = clean(website);
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function companyDomainLabel(website: string | null | undefined) {
  const host = hostFromWebsite(website);
  if (!host) return "";
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return labels[0] || "";
  const suffix = labels.slice(-2).join(".");
  return publicSuffixPairs.has(suffix) && labels.length >= 3
    ? labels.at(-3) || ""
    : labels.at(-2) || "";
}

function titleWord(value: string) {
  if (/^\d+$/.test(value)) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function splitEmbeddedTokens(label: string, city?: string | null) {
  const normalizedCity = clean(city).toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = [...embeddedWordTokens];
  if (normalizedCity.length >= 4 && !tokens.includes(normalizedCity)) tokens.unshift(normalizedCity);

  const parts: string[] = [];
  let remaining = label.toLowerCase();
  while (remaining.length >= 3) {
    const suffix = tokens.find((token) => remaining.endsWith(token) && remaining.length > token.length + 1);
    if (!suffix) break;
    parts.unshift(suffix);
    remaining = remaining.slice(0, -suffix.length);
  }
  if (remaining) parts.unshift(remaining);
  return parts;
}

export function companyNameFromWebsite(website: string | null | undefined, city?: string | null) {
  const label = companyDomainLabel(website);
  if (!label) return "";
  const explicitParts = label.split(/[-_]+/).filter(Boolean);
  const parts = explicitParts.length > 1 ? explicitParts : splitEmbeddedTokens(label, city);
  return parts.map(titleWord).join(" ").slice(0, 80);
}

export function looksLikeProductOrSeoTitle(company: string | null | undefined) {
  const value = clean(company);
  if (!value) return true;
  if (value.length > 80 || /(?:\.\.\.|…|\s[|]\s)/.test(value)) return true;
  if (genericTitlePatterns.some((pattern) => pattern.test(value))) return true;
  const words = value.split(/\s+/);
  return words.length >= 7 && /\b(?:dress|dresses|gown|gowns|shop|shipping|delivery|online|collection)\b/i.test(value);
}

export function resolveCompanyName(input: CompanyNameInput) {
  const current = clean(input.company)
    .replace(/\s*(?:\.\.\.|…).*$/, "")
    .split(/\s*[:|]\s*/, 1)[0]
    .trim()
    .slice(0, 80);
  if (current && !looksLikeProductOrSeoTitle(current)) return current;
  return companyNameFromWebsite(input.website, input.city) || current || "Unknown Company";
}

export type CompanyNameProposal = {
  id: string;
  current: string;
  proposed: string;
  website: string | null;
};

export function companyNameProposal(customer: {
  id: string;
  company: string;
  website: string | null;
  city?: string | null;
}): CompanyNameProposal | null {
  const proposed = resolveCompanyName(customer);
  if (!proposed || proposed.toLowerCase() === clean(customer.company).toLowerCase()) return null;
  if (!looksLikeProductOrSeoTitle(customer.company)) return null;
  return { id: customer.id, current: customer.company, proposed, website: customer.website };
}
