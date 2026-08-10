import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerMessagingProfile,
  classifyCustomer,
  outboundCopyIssues,
  roleSpecificWritingRules,
} from "../lib/customer-messaging.ts";

function customer(overrides = {}) {
  return {
    id: "customer-1",
    company: "Example Occasionwear",
    website: "https://example.com",
    country: "United Kingdom",
    city: "London",
    customer_type: "Evening Dress Retailer",
    priority: "A",
    stage: "New Lead",
    product_category: "Both",
    premium_fit: 80,
    couture_fit: 70,
    price_status: null,
    price_example: null,
    import_probability: null,
    buyer_value: null,
    contact_email: "buyer@example.com",
    whatsapp: null,
    recommended_line: "Size-inclusive refined occasion dresses",
    evidence: "The website presents formal and occasion dresses for a size-inclusive customer base.",
    source_url: "https://example.com/occasion-dresses",
    notes: null,
    next_follow_up_at: null,
    owner_id: null,
    assigned_by: null,
    assigned_at: null,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

test("classifies retailer, brand and importer separately", () => {
  assert.equal(classifyCustomer(customer()), "retailer");
  assert.equal(classifyCustomer(customer({ customer_type: "Designer Fashion Brand" })), "brand");
  assert.equal(classifyCustomer(customer({ customer_type: "Importer / Distributor / Retailer" })), "importer_distributor");
});

test("turns raw product fields into a specific customer opportunity", () => {
  const profile = buildCustomerMessagingProfile(customer());
  assert.equal(profile.productOpportunity, "size-inclusive occasion and evening dresses");
  assert.equal(profile.recipientTerm, "fashion retailers");
  assert.match(profile.valueProposition, /reliable manufacturers in China/i);
});

test("uses development and production language for a fashion brand", () => {
  const profile = buildCustomerMessagingProfile(customer({
    customer_type: "Independent Eveningwear Designer Label",
    recommended_line: "Hand-beaded couture gowns",
  }));
  const rules = roleSpecificWritingRules(profile);
  assert.match(rules, /product development/i);
  assert.match(rules, /fabric sourcing/i);
  assert.match(rules, /Do not lead with MOQ/i);
});

test("blocks old boilerplate and internal template fragments", () => {
  const profile = buildCustomerMessagingProfile(customer());
  const issues = outboundCopyIssues(
    "I came across Example Occasionwear and noticed your focus on Both. Analyze from existing notes may be relevant to international buyers.",
    profile,
  );
  assert.ok(issues.some((issue) => issue.includes("群发式开头")));
  assert.ok(issues.some((issue) => issue.includes("无效产品分类")));
  assert.ok(issues.some((issue) => issue.includes("内部分析模板残留")));
  assert.ok(issues.some((issue) => issue.includes("international buyer")));
});

test("does not treat an importer reference as a customer-type mismatch", () => {
  const profile = buildCustomerMessagingProfile(customer({ customer_type: "Fashion Importer and Distributor" }));
  const issues = outboundCopyIssues(
    "We help international buyers develop evening dress collections with consistent quality and reliable production.",
    profile,
    { requireProductLanguage: true },
  );
  assert.deepEqual(issues, []);
});
