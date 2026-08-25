import type { Customer, FollowUp } from "@/types/database";
import type { GmailMessageContext } from "@/lib/gmail";
import type { CustomerSignalContext } from "@/lib/email-draft";
import {
  buildCustomerMessagingProfile,
  customerDisplayName,
  roleSpecificWritingRules,
} from "@/lib/customer-messaging";

export const manualChannels = ["WhatsApp", "Instagram", "Telegram", "Phone", "LinkedIn"] as const;
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
  const profile = buildCustomerMessagingProfile(customer);
  const company = customerDisplayName(customer.company);
  const goal = safeEnglish(purpose, "", 500);
  const relationshipQuestion = profile.archetype === "brand"
    ? "Are you currently developing an upcoming occasionwear collection or reviewing additional production capabilities?"
    : profile.archetype === "importer_distributor"
      ? "Are you currently reviewing new occasionwear lines or production partners for an upcoming buying cycle?"
      : profile.archetype === "unknown"
        ? "May I ask whether you develop or source occasionwear with external production partners?"
        : "Would a focused discussion about your current occasionwear assortment be useful?";

  if (channel === "Phone") {
    return [
      `Opening: Hello, this is Sam Deng from Guangzhou Bingfeng Information Technology. May I speak with the person responsible for occasionwear product development or sourcing at ${company}?`,
      "",
      `Reason for calling: ${company} is recorded as a ${profile.archetypeLabel}. The most relevant opportunity appears to be ${profile.productOpportunity}. We ${profile.valueProposition}.`,
      "",
      "Discovery questions:",
      `1. ${relationshipQuestion}`,
      "2. Which product categories, quality expectations and delivery windows are most important for your next collection?",
      "3. What would you need to see from a new production partner before evaluating cooperation?",
      ...(profile.archetype === "importer_distributor"
        ? ["4. Which commercial positioning and order structure are most relevant to your market?"]
        : []),
      ...(goal ? ["", `Additional objective: ${goal}`] : []),
      "",
      "Next step: Offer to send only the most relevant product and production information discussed during the call.",
    ].join("\n");
  }

  if (channel === "Instagram") {
    const opening = profile.archetype === "unknown"
      ? `I am reaching out to ${company} to understand whether you work with external occasionwear production partners.`
      : `${company}'s focus as a ${profile.archetypeLabel} looks relevant to our work in ${profile.productOpportunity}.`;
    return [
      `Hi ${company} team,`,
      "",
      opening,
      `We ${profile.valueProposition}.`,
      goal || relationshipQuestion,
      "",
      "If relevant, I would be glad to share a few focused examples here.",
      "",
      "Sam Deng",
    ].join("\n");
  }

  const greeting = channel === "LinkedIn" ? `Hello ${company} team,` : "Hello,";
  const opening = profile.archetype === "unknown"
    ? `I am contacting ${company} to understand whether you work with external production partners for occasionwear.`
    : `${company}'s position as a ${profile.archetypeLabel} appears relevant to our work in ${profile.productOpportunity}.`;
  const request = goal ? `I would particularly like to discuss ${goal}.` : relationshipQuestion;
  const nextStep = profile.archetype === "brand"
    ? "If relevant, I can share a brief introduction to our development capabilities and suitable product examples."
    : "If relevant, I can share a focused selection and explain how it could complement your current business.";

  return [
    greeting,
    "",
    opening,
    `We ${profile.valueProposition}.`,
    request,
    "",
    nextStep,
    "",
    "Regards,",
    "Sam Deng",
    "WhatsApp: +8617728195735",
  ].join("\n");
}

export function buildManualChannelContext(
  customer: Customer,
  followUps: FollowUp[],
  channel: ManualChannel,
  purpose: string,
  messages: GmailMessageContext[] = [],
  signals: CustomerSignalContext[] = [],
) {
  const profile = buildCustomerMessagingProfile(customer);
  const history = followUps.slice(0, 12).map((item, index) =>
    `${index + 1}. ${item.happened_at} | ${item.channel} | ${clean(item.summary, 700)} | ${clean(item.outcome, 200)}`
  ).join("\n") || "None";
  const emailHistory = messages.slice(-8).map((item, index) => [
    `${index + 1}. ${item.date} | ${item.direction.toUpperCase()} | ${clean(item.subject, 400) || "No subject"}`,
    clean(item.content || item.snippet, 1800) || "No readable content",
  ].join("\n")).join("\n\n") || "None";
  const signalHistory = signals.slice(0, 5).map((item, index) => [
    `${index + 1}. ${clean(item.title, 400)} | relevance ${item.relevance_score}`,
    clean(item.summary, 900) || "No summary",
  ].join("\n")).join("\n\n") || "None";

  return [
    `Channel: ${channel}`,
    `Company: ${customerDisplayName(customer.company)}`,
    `Website: ${clean(customer.website, 500) || "Unknown"}`,
    `Location: ${[customer.city, customer.country].filter(Boolean).join(", ") || "Unknown"}`,
    "",
    "RESOLVED CUSTOMER COMMUNICATION PROFILE",
    roleSpecificWritingRules(profile),
    `Verified background summary: ${profile.verifiedBackground}`,
    "",
    "SOURCE CUSTOMER DATA",
    `Customer type: ${clean(customer.customer_type, 400) || "Unknown"}`,
    `Product category: ${clean(customer.product_category, 400) || "Unknown"}`,
    `Recommended product information: ${clean(customer.recommended_line, 1000) || "None"}`,
    `Business evidence: ${clean(customer.evidence, 1800) || "None"}`,
    `Buyer or commercial value notes: ${clean(customer.buyer_value, 800) || "None"}`,
    `Customer notes: ${clean(customer.notes, 1200) || "None"}`,
    `Business objective: ${clean(purpose, 700) || "Start or continue a useful, low-pressure conversation"}`,
    "",
    "RECENT CRM HISTORY",
    history,
    "",
    "MATCHED EMAIL HISTORY",
    emailHistory,
    "",
    "RECENT BUSINESS SIGNALS",
    signalHistory,
  ].join("\n");
}

export function containsCjk(value: string) {
  return cjkPattern.test(value);
}
