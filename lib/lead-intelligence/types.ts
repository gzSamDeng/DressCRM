export type BuyerSignal =
  | "importer"
  | "multi_brand"
  | "premium_positioning"
  | "evening_dress_focus"
  | "wholesale"
  | "international_brands"
  | "physical_stores"
  | "active_social";

export type LeadCandidate = {
  id: string;
  company: string;
  website: string;
  country: string;
  city: string;
  customerType: string;
  description: string;
  sourceUrl: string;
  signals: BuyerSignal[];
  evidence: string[];
};

export type ScoredLead = LeadCandidate & {
  score: number;
  grade: "A+" | "A" | "B" | "C";
  confidence: "High" | "Medium";
  reasons: string[];
  risks: string[];
  recommendation: string;
};

export type IndustryTemplate = {
  industry: string;
  productLine: string;
  market: string;
  keywords: string[];
  negativeKeywords: string[];
  buyerDna: Array<{
    signal: BuyerSignal;
    label: string;
    weight: number;
  }>;
};
