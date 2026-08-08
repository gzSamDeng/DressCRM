import fs from "node:fs/promises";
import path from "node:path";

const keyFile = process.env.SERPER_KEY_FILE;
const outputFile = process.argv[2] || path.join("data", "global-evening-dress-leads.generated.json");

if (!keyFile) throw new Error("SERPER_KEY_FILE is required");
const apiKey = (await fs.readFile(keyFile, "utf8")).trim();
if (!apiKey) throw new Error("Serper API key is empty");

const markets = [
  ["United States", "us", "United States"],
  ["Canada", "ca", "Canada"],
  ["United Kingdom", "gb", "United Kingdom"],
  ["Germany", "de", "Germany"],
  ["France", "fr", "France"],
  ["Spain", "es", "Spain"],
  ["Italy", "it", "Italy"],
  ["Netherlands", "nl", "Netherlands"],
  ["Belgium", "be", "Belgium"],
  ["Poland", "pl", "Poland"],
  ["Romania", "ro", "Romania"],
  ["Greece", "gr", "Greece"],
  ["Ireland", "ie", "Ireland"],
  ["Austria", "at", "Austria"],
  ["Switzerland", "ch", "Switzerland"],
  ["Sweden", "se", "Sweden"],
  ["Norway", "no", "Norway"],
  ["Denmark", "dk", "Denmark"],
  ["Australia", "au", "Australia"],
  ["New Zealand", "nz", "New Zealand"],
  ["United Arab Emirates", "ae", "United Arab Emirates"],
  ["Saudi Arabia", "sa", "Saudi Arabia"],
  ["Russia", "ru", "Russia"],
];

const queryFamilies = [
  ["minimal_commercial", (country) => `evening dress boutique retailer ${country}`],
  ["plus_size", (country) => `plus size evening dress boutique ${country}`],
  ["heavy_embellished", (country) => `luxury beaded evening gown boutique ${country}`],
];

const blockedDomains = [
  "amazon.", "ebay.", "etsy.", "aliexpress.", "alibaba.", "dhgate.", "shein.", "temu.", "walmart.",
  "facebook.com", "instagram.com", "pinterest.", "youtube.com", "tiktok.com", "linkedin.com", "x.com", "twitter.com",
  "yelp.", "yellowpages.", "weddingwire.", "theknot.com", "tripadvisor.", "reddit.com", "quora.com",
  "wikipedia.org", "google.com", "bing.com", "duckduckgo.com", "shopify.com", "made-in-china.com",
  "harrods.com", "net-a-porter.com", "mytheresa.com", "farfetch.com", "revolve.com", "saksfifthavenue.com",
  "noon.com", "nextdirect.com", "pronovias.com", "sherrihill.com", "alyceparis.com", "amarra.com", "alexevenings.com",
  "vienna-unwrapped.com", "visitostersund.se", "costarellos.com", "atelier-eme.com", "kaviargauche.com",
];

const productPattern = /evening|prom|formal\s?wear|occasion|gown|cocktail|ball\s?gown|abendkleid|abendmode|robe de soir|robe de bal|vestido de fiesta|abito da sera|sukienk|rochii|βραδιν|вечерн|плать|вечірн|galajurk|aftenkl/i;
const buyerPattern = /boutique|retail|store|shop|stockist|multi.?brand|department store|showroom|distributor|importer|wholesale/i;
const manufacturerPattern = /manufacturer|factory|oem|odm|private label factory|garment factory|bridal factory/i;
const ownBrandPattern = /official store|fashion designer|designer brand|our brand|leading .{0,20} brand|made.?to.?measure|couture atelier|fashion house/i;
const plusPattern = /plus.?size|curve|curvy|inclusive siz|grö(ß|ss)en|grande taille|taglie forti|tallas grandes|duże rozmiary|размер/i;
const heavyPattern = /bead|sequin|rhinestone|crystal|embellish|feather|couture|luxury gown|hand.?made|hand.?sewn|hand.?beaded/i;
const minimalPattern = /minimal|elegant|modern|timeless|sleek|simple|classic|satin|crepe|occasion/i;
const premiumPattern = /premium|luxury|designer|couture|exclusive|high.?end|curated|independent boutique/i;
const multiBrandPattern = /multi.?brand|brands we carry|designers|shop by brand|stockist/i;
const physicalPattern = /store|boutique|showroom|visit us|locations|appointment/i;
const wholesalePattern = /wholesale|distributor|importer|trade account|b2b/i;

function rootWebsite(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || blockedDomains.some((item) => host.includes(item))) return null;
    return { host, website: `${u.protocol}//${u.host}` };
  } catch {
    return null;
  }
}

function countryFromHost(host, fallback) {
  const suffixes = [
    [".com.au", "Australia"], [".co.nz", "New Zealand"], [".co.uk", "United Kingdom"],
    [".ca", "Canada"], [".de", "Germany"], [".fr", "France"], [".es", "Spain"],
    [".it", "Italy"], [".nl", "Netherlands"], [".be", "Belgium"], [".pl", "Poland"],
    [".ro", "Romania"], [".gr", "Greece"], [".ie", "Ireland"], [".at", "Austria"],
    [".ch", "Switzerland"], [".se", "Sweden"], [".no", "Norway"], [".dk", "Denmark"],
    [".ae", "United Arab Emirates"], [".sa", "Saudi Arabia"], [".ru", "Russia"],
  ];
  return suffixes.find(([suffix]) => host.endsWith(suffix))?.[1] || fallback;
}

const countryTextMatchers = [
  ["Australia", /\bAustralia\b|\bSydney\b|\bMelbourne\b|\bBrisbane\b|\bPerth\b|\bAdelaide\b|\+61\b/ig],
  ["Austria", /\bAustria\b|\bVienna\b|\bWien\b|\+43\b/ig],
  ["Belgium", /\bBelgium\b|\bBrussels\b|\bAntwerp\b|\+32\b/ig],
  ["Canada", /\bCanada\b|\bToronto\b|\bVancouver\b|\bMontreal\b|\bCalgary\b|\bOttawa\b/ig],
  ["Denmark", /\bDenmark\b|\bCopenhagen\b|\+45\b/ig],
  ["France", /\bFrance\b|\bParis\b|\bLyon\b|\+33\b/ig],
  ["Germany", /\bGermany\b|\bDeutschland\b|\bBerlin\b|\bMunich\b|\bHamburg\b|\+49\b/ig],
  ["Greece", /\bGreece\b|\bAthens\b|\bThessaloniki\b|\+30\b/ig],
  ["Ireland", /\bIreland\b|\bDublin\b|\bCork\b|\+353\b/ig],
  ["Italy", /\bItaly\b|\bMilan\b|\bMilano\b|\bRome\b|\bRoma\b|\+39\b/ig],
  ["Netherlands", /\bNetherlands\b|\bAmsterdam\b|\bRotterdam\b|\+31\b/ig],
  ["New Zealand", /\bNew Zealand\b|\bAuckland\b|\bWellington\b|\+64\b/ig],
  ["Norway", /\bNorway\b|\bOslo\b|\+47\b/ig],
  ["Poland", /\bPoland\b|\bWarsaw\b|\bWarszawa\b|\+48\b/ig],
  ["Romania", /\bRomania\b|\bBucharest\b|\bBucurești\b|\+40\b/ig],
  ["Russia", /\bRussia\b|\bMoscow\b|\bSaint Petersburg\b|\bSt\.? Petersburg\b|\+7\b/ig],
  ["Saudi Arabia", /\bSaudi Arabia\b|\bRiyadh\b|\bJeddah\b|\+966\b/ig],
  ["Spain", /\bSpain\b|\bMadrid\b|\bBarcelona\b|\+34\b/ig],
  ["Sweden", /\bSweden\b|\bStockholm\b|\bGothenburg\b|\+46\b/ig],
  ["Switzerland", /\bSwitzerland\b|\bZurich\b|\bGeneva\b|\+41\b/ig],
  ["United Arab Emirates", /\bUnited Arab Emirates\b|\bUAE\b|\bDubai\b|\bAbu Dhabi\b|\+971\b/ig],
  ["United Kingdom", /\bUnited Kingdom\b|\bEngland\b|\bScotland\b|\bWales\b|\bLondon\b|\bManchester\b|\bBirmingham\b|\bEssex\b|\+44\b/ig],
  ["United States", /\bUnited States\b|\bUSA\b|\bU\.S\.A?\.?\b|\bNew York\b|\bLos Angeles\b|\bMiami\b|\bDallas\b|\bChicago\b|\bHouston\b/ig],
];

function countryFromText(text, fallback) {
  const ranked = countryTextMatchers
    .map(([country, pattern]) => [country, (String(text).match(pattern) || []).length])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[0][1] === ranked[1][1])) return fallback;
  return ranked[0][0];
}

function companyFrom(title, host) {
  const generic = /evening|prom|formal|dress|gown|shop|store|boutique|collection|women|fashion|official|online/i;
  const pieces = String(title || "")
    .split(/\s+[|–—]\s+|\s+-\s+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const chosen = pieces.find((part) => part.length >= 2 && part.length <= 70 && !generic.test(part))
    || pieces.find((part) => part.length >= 2 && part.length <= 70)
    || host.split(".")[0];
  return chosen.replace(/\b(home|official site|online store)\b/ig, "").replace(/\s{2,}/g, " ").trim();
}

function grade(score) {
  if (score >= 80) return "A+";
  if (score >= 65) return "A";
  if (score >= 45) return "B";
  return "C";
}

async function serperSearch(body, attempt = 0) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      return serperSearch(body, attempt + 1);
    }
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Serper request failed: ${response.status} ${detail}`);
  }
  return response.json();
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

const tasks = markets.flatMap(([country, gl, location]) =>
  queryFamilies.flatMap(([productLine, makeQuery]) => [1, 2].map((page) => ({ country, gl, location, productLine, page, query: makeQuery(country) }))),
);

console.log(`Searching ${tasks.length} market/product combinations...`);
const searchResponses = await mapLimit(tasks, 4, async (task, index) => {
  const data = await serperSearch({ q: task.query, gl: task.gl, location: task.location, num: 20, page: task.page, autocorrect: false });
  if ((index + 1) % 10 === 0 || index + 1 === tasks.length) console.log(`Search progress ${index + 1}/${tasks.length}`);
  return { task, organic: Array.isArray(data.organic) ? data.organic : [] };
});

const byDomain = new Map();
for (const { task, organic } of searchResponses) {
  for (const result of organic) {
    const root = rootWebsite(result.link);
    if (!root) continue;
    const sourceText = `${result.title || ""} ${result.snippet || ""}`;
    if (!productPattern.test(sourceText) || manufacturerPattern.test(sourceText)) continue;
    if (!buyerPattern.test(sourceText) && !/shop|store|boutique/i.test(result.title || "")) continue;
    if (ownBrandPattern.test(sourceText) && !multiBrandPattern.test(sourceText) && !wholesalePattern.test(sourceText)) continue;
    if (task.productLine === "plus_size" && !plusPattern.test(sourceText)) continue;
    if (task.productLine === "heavy_embellished" && !heavyPattern.test(sourceText)) continue;

    const current = byDomain.get(root.host);
    const evidence = {
      title: String(result.title || "").slice(0, 240),
      snippet: String(result.snippet || "").slice(0, 700),
      url: result.link,
      query: task.query,
    };
    if (!current) {
      byDomain.set(root.host, {
        host: root.host,
        website: root.website,
        company: companyFrom(result.title, root.host),
        country: countryFromHost(root.host, task.country),
        productLines: new Set([task.productLine]),
        evidence: [evidence],
      });
    } else {
      current.productLines.add(task.productLine);
      if (current.evidence.length < 4 && !current.evidence.some((item) => item.url === evidence.url)) current.evidence.push(evidence);
    }
  }
}

const candidates = [...byDomain.values()];
console.log(`Qualified unique websites: ${candidates.length}`);

const contactResponses = await mapLimit(candidates, 5, async (candidate, index) => {
  const query = `${candidate.company} ${candidate.host} contact email phone whatsapp`;
  const data = await serperSearch({ q: query, gl: "us", num: 10, page: 1, autocorrect: false });
  if ((index + 1) % 25 === 0 || index + 1 === candidates.length) console.log(`Contact progress ${index + 1}/${candidates.length}`);
  return Array.isArray(data.organic) ? data.organic : [];
});

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phonePattern = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;

const leads = candidates.map((candidate, index) => {
  const contactResults = contactResponses[index].filter((item) => {
    try {
      const host = new URL(item.link).hostname.toLowerCase().replace(/^www\./, "");
      return host === candidate.host || host.endsWith(`.${candidate.host}`);
    } catch {
      return false;
    }
  });
  const combinedEvidence = candidate.evidence.map((item) => `${item.title} ${item.snippet}`).join(" ");
  const contactText = contactResults.map((item) => `${item.title || ""} ${item.snippet || ""}`).join(" ");
  const resolvedCountry = countryFromText(`${combinedEvidence} ${contactText}`, candidate.country);
  const emails = [...new Set((contactText.match(emailPattern) || []).map((value) => value.toLowerCase()).filter((value) => !/example\.|sentry\.|wixpress\.|cloudflare\./.test(value)))];
  const phones = [...new Set((contactText.match(phonePattern) || []).map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.replace(/\D/g, "").length >= 8))];
  const productLines = [...candidate.productLines];

  const signals = {
    evening_dress_focus: true,
    retailer_or_boutique: buyerPattern.test(combinedEvidence),
    premium_positioning: premiumPattern.test(combinedEvidence),
    multi_brand: multiBrandPattern.test(combinedEvidence),
    wholesale_or_import: wholesalePattern.test(combinedEvidence),
    physical_stores: physicalPattern.test(combinedEvidence),
    plus_size_match: plusPattern.test(combinedEvidence) || productLines.includes("plus_size"),
    heavy_embellished_match: heavyPattern.test(combinedEvidence) || productLines.includes("heavy_embellished"),
    minimal_commercial_match: minimalPattern.test(combinedEvidence) || productLines.includes("minimal_commercial"),
    public_contact_found: emails.length > 0 || phones.length > 0,
  };

  let score = 24;
  if (signals.retailer_or_boutique) score += 18;
  if (signals.plus_size_match || signals.heavy_embellished_match || signals.minimal_commercial_match) score += 14;
  if (signals.premium_positioning) score += 12;
  if (signals.multi_brand) score += 10;
  if (signals.wholesale_or_import) score += 8;
  if (signals.physical_stores) score += 6;
  if (signals.public_contact_found) score += 4;
  score = Math.min(100, score);

  const risks = [];
  if (!signals.public_contact_found) risks.push("未从公开搜索摘要中识别到邮箱或电话，审核时需打开官网联系页补充");
  if (!signals.multi_brand && !signals.wholesale_or_import) risks.push("采购/进口属性需要人工确认");
  if (resolvedCountry === "Russia") risks.push("联系前需核验付款路径、物流可达性与制裁合规");
  if (["United Arab Emirates", "Saudi Arabia"].includes(resolvedCountry)) risks.push("需确认本地尺码、审美及独家代理要求");

  const primaryLine = signals.heavy_embellished_match
    ? "重工礼服"
    : signals.plus_size_match
      ? "简约礼服（含大码）"
      : "简约高级礼服";
  const recommendation = score >= 80
    ? `优先审核并联系：官网显示与${primaryLine}高度匹配，先确认采购模式、目标价位、MOQ和季度上新计划。`
    : score >= 65
      ? `建议审核：产品方向与${primaryLine}匹配，先确认是否直接进口或通过本地分销商采购。`
      : `保留观察：具备礼服零售证据，但采购能力与产品价位仍需确认。`;

  return {
    source_key: `global-2026-08-08:${candidate.host}`,
    company: candidate.company,
    website: candidate.website,
    country: resolvedCountry,
    city: null,
    customer_type: signals.wholesale_or_import ? "Importer / Distributor / Retailer" : signals.multi_brand ? "Multi-brand Boutique / Retailer" : "Evening Dress Retailer",
    product_lines: productLines,
    ai_score: score,
    ai_grade: grade(score),
    confidence: signals.public_contact_found && candidate.evidence.length > 1 ? "high" : signals.public_contact_found ? "medium" : "low",
    signals,
    evidence: candidate.evidence,
    risks,
    recommendation,
    source_url: candidate.evidence[0]?.url || candidate.website,
    contact_email: emails[0] || null,
    contact_phone: phones[0] || null,
    whatsapp: null,
    contact_sources: contactResults.slice(0, 3).map((item) => ({ title: item.title || "Contact page", url: item.link, snippet: item.snippet || "" })),
    data_completeness: Math.min(100, 45 + (emails.length ? 20 : 0) + (phones.length ? 15 : 0) + (candidate.evidence.length > 1 ? 10 : 0) + (signals.multi_brand || signals.wholesale_or_import ? 10 : 0)),
  };
}).filter((lead) => lead.ai_score >= 56)
  .sort((a, b) => b.ai_score - a.ai_score || a.country.localeCompare(b.country) || a.company.localeCompare(b.company));

const report = {
  generated_at: new Date().toISOString(),
  source: "Serper Google Search + official website evidence",
  markets: markets.map(([country]) => country),
  query_count: tasks.length + candidates.length,
  total: leads.length,
  by_country: Object.fromEntries([...new Set(leads.map((lead) => lead.country))].sort().map((country) => [country, leads.filter((lead) => lead.country === country).length])),
  by_grade: Object.fromEntries(["A+", "A", "B", "C"].map((value) => [value, leads.filter((lead) => lead.ai_grade === value).length])),
  leads,
};

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Saved ${leads.length} leads to ${outputFile}`);
