export const excludedLeadDomains = new Set([
  "istanbulfc.com",
  "selene-couture.com",
  "yahoo.com",
  "missrunway.com",
  "missrunway.com.au",
  "lamaisonbridal.com",
  "polenpoe.com",
  "stylishop.com",
  "annakoo.com",
]);

export const excludedLeadEmails = new Set([
  "janelabiye8@gmail.com",
  "hello.ksa@stylishop.com",
  "shop@missrunway.com",
]);

export const excludedLeadCompanyTerms = [
  "janel abiye",
  "la maison bridal",
  "polen poe",
  "stylishop",
  "annakoo",
];

export function normalizedDomain(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

export function isExcludedLead(input: {
  company?: string | null;
  website?: string | null;
  contactEmail?: string | null;
}) {
  const domain = normalizedDomain(input.website);
  if (excludedLeadDomains.has(domain)) return true;
  const email = input.contactEmail?.trim().toLowerCase() ?? "";
  if (excludedLeadEmails.has(email)) return true;
  const company = input.company?.trim().toLowerCase() ?? "";
  return excludedLeadCompanyTerms.some((term) => company.includes(term));
}
