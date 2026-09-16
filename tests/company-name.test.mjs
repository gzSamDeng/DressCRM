import assert from "node:assert/strict";
import test from "node:test";
import {
  companyNameFromWebsite,
  companyNameProposal,
  looksLikeProductOrSeoTitle,
  resolveCompanyName,
} from "../lib/company-name.ts";

test("derives the Aware Barcelona brand from its website and city", () => {
  assert.equal(companyNameFromWebsite("https://awarebarcelona.com", "Barcelona"), "Aware Barcelona");
  assert.equal(resolveCompanyName({
    company: "LONG DRESSES",
    website: "https://awarebarcelona.com",
    city: "Barcelona",
  }), "Aware Barcelona");
});

test("keeps a usable brand prefix from a noisy search title", () => {
  assert.equal(resolveCompanyName({
    company: "After Five Fashion: Prom dresses, Evening dresses, Mother of the ...",
    website: "https://afterfivefashion.com",
  }), "After Five Fashion");
});

test("uses the domain when an ellipsis leaves only a product fragment", () => {
  assert.equal(resolveCompanyName({
    company: "Mother of the ...",
    website: "https://www.prettyperfectboutique.co.uk",
  }), "Prettyperfect Boutique");
  assert.equal(resolveCompanyName({
    company: "Bridal ...",
    website: "https://aldaker.com",
  }), "Aldaker");
});

test("replaces generic shipping and shopping titles with the domain brand", () => {
  assert.equal(resolveCompanyName({ company: "Fast Shipping", website: "https://www.elilhaam.com" }), "Elilhaam");
  assert.equal(resolveCompanyName({ company: "Buy your Evening dresses online", website: "https://www.bubbleroom.se" }), "Bubbleroom");
  assert.equal(resolveCompanyName({ company: "Shop for Evening Dresses in United Arab Emirates", website: "https://vogacloset.com" }), "Voga Closet");
});

test("does not propose changes for an ordinary company name", () => {
  assert.equal(looksLikeProductOrSeoTitle("Aware Barcelona"), false);
  assert.equal(companyNameProposal({
    id: "1",
    company: "Aware Barcelona",
    website: "https://awarebarcelona.com",
    city: "Barcelona",
  }), null);
});

test("proposes a database correction only for suspicious titles", () => {
  assert.deepEqual(companyNameProposal({
    id: "1",
    company: "LONG DRESSES",
    website: "https://awarebarcelona.com",
    city: "Barcelona",
  }), {
    id: "1",
    current: "LONG DRESSES",
    proposed: "Aware Barcelona",
    website: "https://awarebarcelona.com",
  });
});
