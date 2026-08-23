import assert from "node:assert/strict";
import test from "node:test";
import { eveningDressTemplate } from "../lib/lead-intelligence/evening-dress.ts";
import { candidateFromSerperResult } from "../lib/lead-intelligence/serper-connector.ts";

function configuredScore(signals) {
  const score = eveningDressTemplate.buyerDna
    .filter((rule) => signals.includes(rule.signal))
    .reduce((total, rule) => total + rule.weight, 0);
  return Math.min(100, score);
}

test("a premium evening-dress retailer reaches the default B threshold", () => {
  const candidate = candidateFromSerperResult({
    title: "Luxury Evening Dresses | Example Boutique",
    link: "https://example.com/evening-dresses",
    snippet: "Designer evening gowns from a premium fashion retailer.",
  }, "United States");
  assert.ok(candidate);
  const score = configuredScore(candidate.signals);
  assert.ok(score >= 45);
});

test("lead scores never exceed 100 after adding industry signals", () => {
  const score = configuredScore(eveningDressTemplate.buyerDna.map((rule) => rule.signal));
  assert.equal(score, 100);
});
