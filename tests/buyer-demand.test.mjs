import assert from "node:assert/strict";
import test from "node:test";
import { describeSerperFailure, isBuyerDemandDetailUrl, isStoredBuyerDemandValid, qualifyBuyerDemand, verifyBuyerDemandSource } from "../lib/lead-intelligence/buyer-demand.ts";

const now = new Date("2026-08-14T00:00:00.000Z");

test("qualifies a recent explicit evening-dress buying request", () => {
  const demand = qualifyBuyerDemand({ title: "Wanted: A Line V-Neck Sequin Evening Dress",
    link: "https://www.go4worldbusiness.com/buylead/view/1293192/wanted-a-line-v-neck-sequin-evening-dress.html",
    snippet: "Buyer from Singapore. Quantity Required: 100-200 Pieces. Looking for supplier worldwide.", date: "3 days ago" }, now);
  assert.ok(demand); assert.equal(demand.country, "Singapore"); assert.match(demand.quantity ?? "", /100-200/i);
  assert.equal(demand.platform, "go4WorldBusiness"); assert.ok(demand.score >= 80);
});

test("rejects search/category URLs and unrelated titles with contaminated snippets", () => {
  assert.equal(isBuyerDemandDetailUrl("https://www.go4worldbusiness.com/find?searchText=evening-dress"), false);
  assert.equal(isBuyerDemandDetailUrl("https://www.go4worldbusiness.com/buyers/evening-wear.html"), false);
  assert.equal(isBuyerDemandDetailUrl("https://www.go4worldbusiness.com/buylead/view/1293192/wanted-evening-dress.html"), true);
  assert.equal(qualifyBuyerDemand({
    title: "Polyester T Shirts Buyers & Importers in Maldives",
    link: "https://www.go4worldbusiness.com/find?searchText=polyester-t-shirts&BuyersOrSuppliers=buyers",
    snippet: "Evening Dress · Children Garment. Wanted: Baby Diapers. Quantity Required: 5-10.",
    date: "2 days ago",
  }, now), null);
  assert.equal(qualifyBuyerDemand({
    title: "Sofa.com appoints Sunayna Azam as new MD",
    link: "https://www.linkedin.com/posts/example-news-123",
    snippet: "Occasionwear, Bridal & Ready-to-Wear. This is showing up in the RFQ.",
    date: "1 month ago",
  }, now), null);
});

test("rejects supplier ads and results without procurement intent", () => {
  assert.equal(qualifyBuyerDemand({ title: "Evening Dress Manufacturer and Supplier",
    link: "https://supplier.example.com/evening-dress", snippet: "We are a manufacturer. Shop now and add to cart." }, now), null);
  assert.equal(qualifyBuyerDemand({ title: "Best Prom Dresses for 2026",
    link: "https://fashion.example.com/prom-dresses", snippet: "Explore new formal gown trends." }, now), null);
});

test("uses a stable URL-based source key for deduplication", () => {
  const input = { title: "RFQ for wholesale formal gowns", link: "https://www.tradekey.com/buyoffer/formal-gowns-123.html",
    snippet: "Looking for supplier of evening dresses. Quantity required: 300 pcs." };
  assert.equal(qualifyBuyerDemand(input, now)?.sourceKey, qualifyBuyerDemand(input, now)?.sourceKey);
});

test("only accepts known auditable RFQ detail URL patterns", () => {
  assert.equal(isBuyerDemandDetailUrl("https://news.example.com/rfq-evening-dress"), false);
  assert.equal(isBuyerDemandDetailUrl("https://www.linkedin.com/company/example/posts"), false);
  assert.equal(isBuyerDemandDetailUrl("https://www.linkedin.com/posts/buyer-rfq-evening-dresses-activity-123"), true);
});

test("revalidates stored buyer-demand evidence before keeping it pending", () => {
  assert.equal(isStoredBuyerDemandValid({
    source_url: "https://www.linkedin.com/posts/example-news-123",
    evidence: ["需求标题：Sofa.com appoints Sunayna Azam as new MD", "公开描述：Occasionwear and RFQ commentary"],
  }), false);
  assert.equal(isStoredBuyerDemandValid({
    source_url: "https://www.go4worldbusiness.com/buylead/view/1293192/wanted-evening-dress.html",
    evidence: ["需求标题：Wanted: Sequin Evening Dress", "公开描述：Quantity Required: 100 Pieces"],
  }), true);
});

test("requires procurement details on the source page before import", async () => {
  const candidate = qualifyBuyerDemand({
    title: "Wanted: A Line Sequin Evening Dress",
    link: "https://www.go4worldbusiness.com/buylead/view/1293192/wanted-evening-dress.html",
    snippet: "Buyer from Singapore. Quantity Required: 100 Pieces.", date: "3 days ago",
  }, now);
  assert.ok(candidate);
  const verified = await verifyBuyerDemandSource(candidate, async () => new Response(
    "<html><body><h1>Wanted: Sequin Evening Dress</h1><p>Buying Lead</p><p>Buyer from Singapore</p><p>Quantity Required: 100 Pieces</p><p>Looking for supplier of evening gowns.</p></body></html>",
    { status: 200, headers: { "content-type": "text/html" } },
  ));
  assert.ok(verified?.signals.includes("source_page_verified"));
  const rejected = await verifyBuyerDemandSource(candidate, async () => new Response(
    "<html><body><h1>Sofa.com appoints a new MD</h1><p>Industry news and market report about occasionwear. RFQ is mentioned in a comment.</p></body></html>",
    { status: 200, headers: { "content-type": "text/html" } },
  ));
  assert.equal(rejected, null);
});

test("turns Serper failures into useful operator messages", () => {
  assert.match(describeSerperFailure(400, JSON.stringify({ message: "Not enough credits" })), /额度不足/);
  assert.match(describeSerperFailure(401, JSON.stringify({ message: "Unauthorized" })), /API Key/);
  assert.match(describeSerperFailure(429), /频繁/);
  assert.match(describeSerperFailure(400), /搜索条件/);
});
