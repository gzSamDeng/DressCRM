import type { Customer, FollowUp } from "@/types/database";
import type { GmailMessageContext } from "@/lib/gmail";

export const SALES_EMAIL_SIGNATURE = [
  "-",
  "Regards,",
  "Sam Deng",
  "Guangzhou Bingfeng Information Technology Co., Ltd.",
  "WhatsApp: +86 17728195735(Sam)",
].join("\n");

export type CustomerSignalContext = {
  title: string;
  summary: string | null;
  signal_type: string;
  relevance_score: number;
  published_at: string | null;
  source_url: string;
};

function clean(value: string | null | undefined, maxLength = 1800) {
  return (value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

const cjkPattern = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const sellerCentricSubjectPattern = /\b(?:follow(?:ing)?\s*up|checking\s+in|touching\s+base|reaching\s+out)\b/i;

export function containsCjk(value: string) {
  return cjkPattern.test(value);
}

export function isCustomerFocusedEnglishSubject(value: string) {
  const subject = clean(value, 180);
  return Boolean(subject)
    && !containsCjk(subject)
    && !sellerCentricSubjectPattern.test(subject);
}

function englishReference(value: string | null | undefined, fallback: string, maxLength: number) {
  const reference = clean(value, maxLength);
  return reference && !containsCjk(reference) ? reference : fallback;
}

export function appendSalesSignature(body: string) {
  const withoutExistingClosing = body
    .trim()
    .replace(/\n{1,3}(?:best regards|kind regards|regards|sincerely)[,!]?\s*(?:\n[\s\S]*)?$/i, "")
    .trim();
  return `${withoutExistingClosing}\n\n${SALES_EMAIL_SIGNATURE}`;
}

export function buildDraftContext(
  customer: Customer,
  followUps: FollowUp[],
  messages: GmailMessageContext[],
  signals: CustomerSignalContext[],
  purpose: string,
) {
  const customerProfile = [
    `Company: ${clean(customer.company, 300)}`,
    `Website: ${clean(customer.website, 500) || "Unknown"}`,
    `Location: ${[customer.city, customer.country].filter(Boolean).join(", ") || "Unknown"}`,
    `Customer type: ${clean(customer.customer_type, 500) || "Unknown"}`,
    `CRM priority and stage: ${customer.priority}; ${clean(customer.stage, 200) || "Unknown"}`,
    `Product category: ${clean(customer.product_category, 500) || "Evening dresses"}`,
    `Recommended product line: ${clean(customer.recommended_line, 1500) || "Not recorded"}`,
    `Premium fit / Couture fit: ${customer.premium_fit} / ${customer.couture_fit}`,
    `Price positioning: ${clean(customer.price_status, 300) || "Unknown"}; example: ${clean(customer.price_example, 300) || "Unknown"}`,
    `Import probability: ${clean(customer.import_probability, 300) || "Unknown"}`,
    `Buyer value: ${clean(customer.buyer_value, 1000) || "Not recorded"}`,
    `CRM evidence: ${clean(customer.evidence) || "None"}`,
    `CRM notes: ${clean(customer.notes) || "None"}`,
    `Requested purpose for this email: ${clean(purpose, 1000) || "Continue the relationship and ask about the current buying plan"}`,
  ].join("\n");

  const crmHistory = followUps.length
    ? followUps.map((item, index) => [
      `${index + 1}. ${item.happened_at} | ${clean(item.channel, 100)}`,
      `Summary: ${clean(item.summary, 1000)}`,
      `Outcome: ${clean(item.outcome, 500) || "Not recorded"}`,
      `Next action: ${clean(item.next_action, 500) || "Not recorded"}`,
    ].join("\n")).join("\n\n")
    : "None";

  const gmailHistory = messages.length
    ? messages.map((item, index) => [
      `${index + 1}. ${item.date} | ${item.direction.toUpperCase()} | ${clean(item.subject, 500) || "No subject"}`,
      clean(item.content || item.snippet, 3000) || "No readable content",
    ].join("\n")).join("\n\n")
    : "None";

  const signalHistory = signals.length
    ? signals.map((item, index) => [
      `${index + 1}. ${clean(item.title, 500)} | relevance ${item.relevance_score}`,
      clean(item.summary, 1200) || "No summary",
      `Published: ${item.published_at || "Unknown"}; source: ${clean(item.source_url, 700)}`,
    ].join("\n")).join("\n\n")
    : "None";

  return [
    "CUSTOMER PROFILE",
    customerProfile,
    "",
    "CRM FOLLOW-UP HISTORY (newest first)",
    crmHistory,
    "",
    "MATCHED GMAIL HISTORY (oldest first)",
    gmailHistory,
    "",
    "RECENT BUSINESS SIGNALS",
    signalHistory,
  ].join("\n");
}

export function contextualTemplateDraft(
  customer: Customer,
  followUps: FollowUp[],
  messages: GmailMessageContext[],
  purpose: string,
) {
  const latestReceived = [...messages].reverse().find((item) => item.direction === "received");
  const hasCommunication = messages.length > 0 || followUps.length > 0;
  const company = englishReference(customer.company, "your business", 240);
  const positioning = englishReference(
    customer.customer_type,
    englishReference(customer.product_category, "fashion retail", 240),
    240,
  );
  const productFit = englishReference(customer.recommended_line, "our premium evening dress collection", 280);
  const requestedPurpose = englishReference(purpose, "", 500);
  const latestSubject = englishReference(latestReceived?.subject, "", 500);

  const subject = latestReceived && latestSubject
    ? `Re: ${latestSubject.replace(/^re:\s*/i, "")}`
    : hasCommunication
      ? `New evening dress styles for ${company}`
      : `Evening dress collection for ${company}`;

  const opening = latestReceived
    ? `Thank you for your earlier message regarding “${latestSubject || "our possible cooperation"}”. I wanted to continue from our previous conversation.`
    : hasCommunication
      ? "I wanted to continue our earlier conversation and share something relevant to your business."
      : `I came across ${company} and noticed your focus on ${positioning}.`;

  const purposeLine = requestedPurpose
    ? `For this note, I would like to discuss ${requestedPurpose}.`
    : "May I ask whether you are currently reviewing new evening dress suppliers or planning an upcoming collection?";

  const body = [
    "Dear Team,",
    "",
    opening,
    "",
    `Based on your market positioning, ${productFit} may be particularly relevant. We can support selected styles, flexible order quantities and stable production for international buyers.`,
    purposeLine,
    "",
    "If useful, I can prepare a concise selection with wholesale prices and lead-time details tailored to your market.",
  ].join("\n");

  return { subject, body: appendSalesSignature(body), source: "template" as const };
}
