import type { IndustryTemplate } from "./types";

export const eveningDressTemplate: IndustryTemplate = {
  industry: "Fashion",
  productLine: "Evening Dress",
  market: "Turkey",
  keywords: [
    "evening dress boutique",
    "luxury abiye",
    "designer evening wear",
    "occasion wear importer",
    "multi-brand dress store",
  ],
  negativeKeywords: ["rental only", "fast fashion", "manufacturer only"],
  buyerDna: [
    { signal: "importer", label: "有进口或国际采购证据", weight: 24 },
    { signal: "premium_positioning", label: "客单价与品牌定位匹配", weight: 18 },
    { signal: "evening_dress_focus", label: "晚礼服是核心品类", weight: 16 },
    { signal: "multi_brand", label: "多品牌买手店/零售商", weight: 14 },
    { signal: "wholesale", label: "具备批发或分销能力", weight: 10 },
    { signal: "international_brands", label: "销售国际品牌", weight: 8 },
    { signal: "physical_stores", label: "有实体门店网络", weight: 6 },
    { signal: "active_social", label: "线上渠道持续活跃", weight: 4 },
  ],
};
