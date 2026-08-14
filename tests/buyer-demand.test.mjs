import assert from "node:assert/strict";
import test from "node:test";
import { describeSerperFailure, qualifyBuyerDemand } from "../lib/lead-intelligence/buyer-demand.ts";

const now = new Date("2026-08-14T00:00:00.000Z");

test("qualifies a recent explicit evening-dress buying request", () => {
  const demand = qualifyBuyerDemand({ title: "Wanted: A Line V-Neck Sequin Evening Dress",
    link: "https://www.go4worldbusiness.com/buyoffer/example.html",
    snippet: "Buyer from Singapore. Quantity Required: 100-200 Pieces. Looking for supplier worldwide.", date: "3 days ago" }, now);
  assert.ok(demand); assert.equal(demand.country, "Singapore"); assert.match(demand.quantity ?? "", /100-200/i);
  assert.equal(demand.platform, "go4WorldBusiness"); assert.ok(demand.score >= 80);
});

test("rejects supplier ads and results without procurement intent", () => {
  assert.equal(qualifyBuyerDemand({ title: "Evening Dress Manufacturer and Supplier",
    link: "https://supplier.example.com/evening-dress", snippet: "We are a manufacturer. Shop now and add to cart." }, now), null);
  assert.equal(qualifyBuyerDemand({ title: "Best Prom Dresses for 2026",
    link: "https://fashion.example.com/prom-dresses", snippet: "Explore new formal gown trends." }, now), null);
});

test("uses a stable URL-based source key for deduplication", () => {
  const input = { title: "RFQ for wholesale formal gowns", link: "https://example.com/rfq/123",
    snippet: "Looking for supplier of evening dresses. Quantity required: 300 pcs." };
  assert.equal(qualifyBuyerDemand(input, now)?.sourceKey, qualifyBuyerDemand(input, now)?.sourceKey);
});

test("turns Serper failures into useful operator messages", () => {
  assert.match(describeSerperFailure(400, JSON.stringify({ message: "Not enough credits" })), /额度不足/);
  assert.match(describeSerperFailure(401, JSON.stringify({ message: "Unauthorized" })), /API Key/);
  assert.match(describeSerperFailure(429), /频繁/);
  assert.match(describeSerperFailure(400), /搜索条件/);
});
