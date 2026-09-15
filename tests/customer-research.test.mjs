import assert from "node:assert/strict";
import test from "node:test";
import {
  customerDomain,
  isCustomerResearchMatch,
  isResearchFresh,
  parseResearchDate,
  scoreResearchItem,
  selectFreshCustomerSignals,
} from "../lib/customer-research.ts";

const customer = {
  id: "customer-1",
  company: "Aware Barcelona",
  website: "https://www.awarebarcelona.com/collections",
  country: "Spain",
  customer_type: "Occasionwear Fashion Brand",
  product_category: "Evening dresses",
  priority: "A",
};

test("normalizes a customer website to its registrable host", () => {
  assert.equal(customerDomain(customer.website), "awarebarcelona.com");
});

test("accepts first-party updates and rejects unrelated company news", () => {
  assert.equal(isCustomerResearchMatch({
    title: "New occasionwear collection",
    link: "https://awarebarcelona.com/blog/new-collection",
  }, customer), true);
  assert.equal(isCustomerResearchMatch({
    title: "Barcelona retail market report",
    link: "https://unrelated.example/report",
    snippet: "General fashion news from Barcelona.",
  }, customer), false);
});

test("parses relative dates and scores recent commercial signals highly", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  assert.equal(parseResearchDate("2 days ago", now), "2026-09-13T00:00:00.000Z");
  assert.ok(scoreResearchItem({
    title: "Aware Barcelona launches a new evening dress collection",
    link: "https://awarebarcelona.com/news/collection",
    snippet: "The fashion brand is expanding its occasionwear range.",
    date: "2 days ago",
  }, customer, now) >= 80);
});

test("keeps only fresh research signals for email generation", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  const fresh = { title: "Fresh", published_at: "2026-09-10T00:00:00.000Z", created_at: "2026-09-10T00:00:00.000Z" };
  const stale = { title: "Stale", published_at: "2025-01-10T00:00:00.000Z", created_at: "2025-01-10T00:00:00.000Z" };
  assert.deepEqual(selectFreshCustomerSignals([fresh, stale], now), [fresh]);
  assert.equal(isResearchFresh(fresh.created_at, now), true);
  assert.equal(isResearchFresh(stale.created_at, now), false);
});
