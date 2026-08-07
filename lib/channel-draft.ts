import type { Customer, FollowUp } from "@/types/database";

export const manualChannels = ["WhatsApp", "Telegram", "Phone", "LinkedIn"] as const;
export type ManualChannel = typeof manualChannels[number];

const cjkPattern = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function clean(value: string | null | undefined, maxLength = 1200) {
  return (value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function safeEnglish(value: string | null | undefined, fallback: string, maxLength = 280) {
  const result = clean(value, maxLength);
  return result && !cjkPattern.test(result) ? result : fallback;
}

export function isManualChannel(value: string): value is ManualChannel {
  return manualChannels.includes(value as ManualChannel);
}

export function channelDraftFallback(customer: Customer, channel: ManualChannel, purpose: string) {
  const company = safeEnglish(customer.company, "your team", 200);
  const positioning = safeEnglish(customer.customer_type, "fashion retail", 240);
  const product = safeEnglish(customer.recommended_line, "our premium evening dress collection", 300);
  const goal = safeEnglish(purpose, "", 500);

  if (channel === "Phone") {
    return [
      `Opening: Hello, this is Sam Deng from Guangzhou Bingfeng Information Technology. May I speak with the person responsible for evening dress purchasing at ${company}?`,
      "",
      `Reason for calling: We work with international boutiques and buyers on premium evening dresses. Based on your focus on ${positioning}, ${product} may be relevant to your market.`,
      "",
      "Questions:",
      "1. Are you currently reviewing new evening dress suppliers or planning an upcoming collection?",
      "2. Which price range, order quantity and delivery window are most relevant?",
      "3. Would it be useful if I sent a short selection with wholesale prices and lead times?",
      ...(goal ? ["", `Additional objective: ${goal}`] : []),
    ].join("\n");
  }

  const opening = channel === "LinkedIn" ? `Hello ${company} team,` : `Hello, this is Sam Deng. I came across ${company} and noticed your focus on ${positioning}.`;
  return [
    opening,
    "",
    `${product} may be relevant to your market. We support international boutiques and buyers with selected evening dress styles, flexible order quantities and stable production.`,
    goal ? `I am reaching out regarding ${goal}.` : "Are you currently reviewing new suppliers or planning an upcoming collection?",
    "",
    "If useful, I can share a concise selection with wholesale prices and lead-time details.",
    "",
    "Regards,",
    "Sam Deng",
    "WhatsApp: +86 17728195735",
  ].join("\n");
}

export function buildManualChannelContext(customer: Customer, followUps: FollowUp[], channel: ManualChannel, purpose: string) {
  const history = followUps.slice(0, 12).map((item, index) =>
    `${index + 1}. ${item.happened_at} | ${item.channel} | ${clean(item.summary, 700)} | ${clean(item.outcome, 200)}`
  ).join("\n") || "None";
  return [
    `Channel: ${channel}`,
    `Company: ${clean(customer.company, 250)}`,
    `Location: ${[customer.city, customer.country].filter(Boolean).join(", ") || "Unknown"}`,
    `Customer type: ${clean(customer.customer_type, 400) || "Unknown"}`,
    `Product fit: ${clean(customer.recommended_line, 800) || clean(customer.product_category, 300)}`,
    `Customer notes: ${clean(customer.notes, 1200) || "None"}`,
    `Business objective: ${clean(purpose, 700) || "Start or continue a useful conversation about the customer's current buying plan"}`,
    "",
    "RECENT CRM HISTORY",
    history,
  ].join("\n");
}

export function containsCjk(value: string) {
  return cjkPattern.test(value);
}
