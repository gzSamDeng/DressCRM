import type { Customer } from "@/types/database";

export type CustomerArchetype =
  | "brand"
  | "multi_brand_retailer"
  | "retailer"
  | "importer_distributor"
  | "apparel_company"
  | "unknown";

export type CustomerMessagingProfile = {
  archetype: CustomerArchetype;
  archetypeLabel: string;
  recipientTerm: string;
  productOpportunity: string;
  valueProposition: string;
  verifiedBackground: string;
  backgroundReady: boolean;
};

const cjkPattern = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const internalFragmentPattern = /\b(?:both|unknown|unclassified|analy[sz]e from existing notes|existing notes|crm notes?|buyer dna|ai score|product fit|recommended line|needs verification|not recorded)\b/i;

function clean(value: string | null | undefined, maxLength = 1800) {
  return (value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function usableEnglish(value: string | null | undefined, maxLength = 500) {
  const result = clean(value, maxLength);
  return result && !cjkPattern.test(result) && !internalFragmentPattern.test(result) ? result : "";
}

function allCustomerText(customer: Customer) {
  return [
    customer.customer_type,
    customer.product_category,
    customer.recommended_line,
    customer.evidence,
    customer.notes,
    customer.buyer_value,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function classifyCustomer(customer: Customer): CustomerArchetype {
  const text = allCustomerText(customer);
  if (/\b(importer|distributor|wholesal(?:e|er)|trading company|buying house|buying office)\b/.test(text)) {
    return "importer_distributor";
  }
  if (/\b(multi[- ]brand|stockist|department store|concept store|boutique retailer)\b/.test(text)) {
    return "multi_brand_retailer";
  }
  if (/\b(designer|design house|fashion brand|dress brand|label|own brand|private label)\b/.test(text)) {
    return "brand";
  }
  if (/\b(retailer|boutique|store|shop|e-?commerce|online retail|showroom)\b/.test(text)) {
    return "retailer";
  }
  if (/\b(apparel|fashion company|clothing company)\b/.test(text)) return "apparel_company";
  return "unknown";
}

function resolveProductOpportunity(customer: Customer) {
  const text = allCustomerText(customer);
  const heavy = /\b(bead(?:ed|ing)?|embellish(?:ed|ment)?|sequin|crystal|couture|gala|statement gown)\b|重工|钉珠|珠片/.test(text);
  const plus = /\b(plus[- ]size|curve|curvy|size[- ]inclusive|inclusive sizing)\b|大码/.test(text);
  const refined = /\b(minimal|refined|sleek|contemporary|commercial|cocktail|occasionwear|occasion wear)\b|简约/.test(text);

  if (heavy && plus) return "size-inclusive, hand-embellished evening gowns";
  if (heavy && refined) return "refined commercial evening dresses and hand-embellished statement gowns";
  if (heavy) return "hand-embellished evening gowns with detailed beadwork";
  if (plus) return "size-inclusive occasion and evening dresses";
  if (refined) return "refined, commercially wearable evening and occasion dresses";
  return "occasionwear product development aligned with the recipient's assortment";
}

function archetypeDetails(archetype: CustomerArchetype) {
  switch (archetype) {
    case "brand":
      return {
        archetypeLabel: "fashion or eveningwear brand",
        recipientTerm: "fashion brands",
        valueProposition: "support product development, fabric sourcing, quality consistency and reliable production through an established manufacturing network in China",
      };
    case "multi_brand_retailer":
      return {
        archetypeLabel: "multi-brand boutique or retailer",
        recipientTerm: "multi-brand retailers",
        valueProposition: "help strengthen occasionwear assortments with differentiated product development, stable quality and dependable production in China",
      };
    case "retailer":
      return {
        archetypeLabel: "fashion retailer or boutique",
        recipientTerm: "fashion retailers",
        valueProposition: "help retailers develop occasionwear that fits their customer profile, with consistent quality and efficient production through reliable manufacturers in China",
      };
    case "importer_distributor":
      return {
        archetypeLabel: "importer, wholesaler or distributor",
        recipientTerm: "importers and distributors",
        valueProposition: "support commercially viable collection development, dependable supply, consistent quality and efficient production through a reliable manufacturing network in China",
      };
    case "apparel_company":
      return {
        archetypeLabel: "apparel company",
        recipientTerm: "apparel companies",
        valueProposition: "support collection development, fabric sourcing, quality control and reliable production through established manufacturers in China",
      };
    default:
      return {
        archetypeLabel: "business operating in the occasionwear market; exact role requires confirmation",
        recipientTerm: "occasionwear companies",
        valueProposition: "support relevant occasionwear development with fabric sourcing, stable quality and efficient production through reliable manufacturers in China",
      };
  }
}

function verifiedBackground(customer: Customer, archetypeLabel: string, productOpportunity: string) {
  const type = usableEnglish(customer.customer_type, 300);
  const location = [usableEnglish(customer.city, 100), usableEnglish(customer.country, 100)].filter(Boolean).join(", ");
  const website = usableEnglish(customer.website, 400);
  const detail = type || archetypeLabel;
  const locationPhrase = location ? ` in ${location}` : "";
  const websitePhrase = website ? `; website recorded as ${website}` : "";
  return `${detail}${locationPhrase}; relevant opportunity: ${productOpportunity}${websitePhrase}`;
}

export function buildCustomerMessagingProfile(customer: Customer): CustomerMessagingProfile {
  const archetype = classifyCustomer(customer);
  const productOpportunity = resolveProductOpportunity(customer);
  const details = archetypeDetails(archetype);
  const hasLocation = Boolean(clean(customer.country) || clean(customer.city));
  const hasBusinessType = Boolean(usableEnglish(customer.customer_type, 300));
  const hasEvidence = Boolean(clean(customer.evidence) || clean(customer.website) || clean(customer.source_url));
  return {
    archetype,
    ...details,
    productOpportunity,
    valueProposition: details.valueProposition,
    verifiedBackground: verifiedBackground(customer, details.archetypeLabel, productOpportunity),
    backgroundReady: hasBusinessType || hasEvidence || hasLocation,
  };
}

const hardTemplateLeakPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnoticed your focus on\s+(?:both|unknown|unclassified)\b/i, reason: "包含无效产品分类" },
  { pattern: /\banaly[sz]e from existing notes\b/i, reason: "包含内部分析模板残留" },
  { pattern: /\b(?:crm notes?|buyer dna|ai score|product fit|recommended line)\b/i, reason: "暴露内部系统字段" },
  { pattern: /\bi came across\b/i, reason: "使用了明显的群发式开头" },
  { pattern: /\bwe can support selected styles,? flexible order quantities and stable production\b/i, reason: "使用了旧版固定销售模板" },
];

export function outboundCopyIssues(
  text: string,
  profile: CustomerMessagingProfile,
  options: { requireProductLanguage?: boolean } = {},
) {
  const issues = hardTemplateLeakPatterns.filter((item) => item.pattern.test(text)).map((item) => item.reason);
  if (cjkPattern.test(text)) issues.push("包含中文或全角字符");
  if (profile.archetype !== "importer_distributor" && /\binternational buyers?\b/i.test(text)) {
    issues.push("客户不是进口商或分销商，却被称为 international buyer");
  }
  if (["brand", "multi_brand_retailer", "retailer", "apparel_company"].includes(profile.archetype)
    && /\bflexible (?:order quantities|moq)\b/i.test(text)) {
    issues.push("对品牌或零售客户不应把 MOQ 作为首要卖点");
  }
  if (options.requireProductLanguage
    && !/\b(?:evening|occasion|formal|gown|dress|collection|product development|fabric sourcing|production)\b/i.test(text)) {
    issues.push("缺少具体产品或合作价值描述");
  }
  return Array.from(new Set(issues));
}

export function roleSpecificWritingRules(profile: CustomerMessagingProfile) {
  const common = [
    `Resolved customer archetype: ${profile.archetypeLabel}.`,
    `Refer to this type of recipient as: ${profile.recipientTerm}.`,
    `Most relevant product opportunity: ${profile.productOpportunity}.`,
    `Value proposition to use selectively: We ${profile.valueProposition}.`,
  ];
  if (profile.archetype === "brand") {
    common.push("Prioritize product development, fabric sourcing, quality consistency and production reliability. Do not lead with MOQ or wholesale pricing.");
  } else if (["retailer", "multi_brand_retailer"].includes(profile.archetype)) {
    common.push("Connect the product opportunity to the retailer's assortment and customer profile. Do not describe the retailer as an international buyer.");
  } else if (profile.archetype === "importer_distributor") {
    common.push("Collection breadth, commercial positioning, reliable supply, lead time and order structure may be relevant, but only mention MOQ when useful.");
  } else {
    common.push("The exact business role is not verified. Use cautious language and ask one useful qualification question instead of assuming purchasing authority.");
  }
  return common.join("\n");
}
