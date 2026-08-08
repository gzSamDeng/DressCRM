import fs from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("Pass the generated lead JSON path");

const matchers = [
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

function inferCountry(text, fallback) {
  const ranked = matchers
    .map(([country, pattern]) => [country, (String(text).match(pattern) || []).length])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[0][1] === ranked[1][1])) return fallback;
  return ranked[0][0];
}

const report = JSON.parse(await fs.readFile(file, "utf8"));
for (const lead of report.leads) {
  const text = [
    ...lead.evidence.flatMap((item) => [item.title, item.snippet]),
    ...lead.contact_sources.flatMap((item) => [item.title, item.snippet]),
  ].join(" ");
  lead.country = inferCountry(text, lead.country);
  lead.risks = lead.risks.filter((risk) => !risk.includes("制裁合规") && !risk.includes("本地尺码"));
  if (lead.country === "Russia") lead.risks.push("联系前需核验付款路径、物流可达性与制裁合规");
  if (["United Arab Emirates", "Saudi Arabia"].includes(lead.country)) lead.risks.push("需确认本地尺码、审美及独家代理要求");
}
report.leads.sort((a, b) => b.ai_score - a.ai_score || a.country.localeCompare(b.country) || a.company.localeCompare(b.company));
report.by_country = Object.fromEntries([...new Set(report.leads.map((lead) => lead.country))].sort().map((country) => [country, report.leads.filter((lead) => lead.country === country).length]));
await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Normalized ${report.leads.length} leads`);
