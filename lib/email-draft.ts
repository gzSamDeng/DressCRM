import type { Customer, FollowUp } from "@/types/database";
import type { GmailMessageContext } from "@/lib/gmail";
import {
  buildCustomerMessagingProfile,
  roleSpecificWritingRules,
} from "@/lib/customer-messaging";

export const SALES_EMAIL_SIGNATURE = [
  "-",
  "Regards,",
  "Sam Deng",
  "Explore our B2B evening dress collection: https://auroragowns.com/",
  "WhatsApp: +8615011905735(Sam)",
].join("\n");

export const CUSTOMER_EMAIL_ALGORITHM_VERSION = "2026.09-intelligence";

export type CustomerSignalContext = {
  title: string;
  summary: string | null;
  signal_type: string;
  relevance_score: number;
  published_at: string | null;
  source_url: string;
  created_at?: string | null;
};

export type CustomerEmailStrategy = {
  key: "customer_reply" | "market_signal" | "product_fit" | "collection_planning" | "production_value" | "reengagement";
  label: string;
  instruction: string;
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

function chronologicalMessages(messages: GmailMessageContext[]) {
  return [...messages].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

export function selectCustomerEmailStrategy(
  customer: Customer,
  followUps: FollowUp[],
  messages: GmailMessageContext[],
  signals: CustomerSignalContext[],
): CustomerEmailStrategy {
  const chronological = chronologicalMessages(messages);
  const latestMessage = chronological.at(-1);
  if (latestMessage?.direction === "received") {
    return {
      key: "customer_reply",
      label: "客户回复优先",
      instruction: "The customer's latest inbound email is the primary source of truth. Directly answer its questions, objections, requested information and timing before introducing any new sales angle.",
    };
  }

  const sentCount = Math.max(
    chronological.filter((message) => message.direction === "sent").length,
    followUps.filter((item) => /email|邮件/i.test(item.channel)).length,
  );
  const hasRecentDatedSignal = signals.some((signal) => Boolean(signal.published_at));
  if (hasRecentDatedSignal && sentCount % 3 === 0) {
    return {
      key: "market_signal",
      label: "近期市场动态",
      instruction: "Use one recent, relevant and clearly attributed business signal as a concise conversation hook. State it cautiously and never imply that a public announcement proves buying intent.",
    };
  }

  const rotating: CustomerEmailStrategy[] = [
    {
      key: "product_fit",
      label: "产品匹配",
      instruction: "Lead with a specific product-fit hypothesis for the recipient's assortment or brand direction, then ask one useful qualification question.",
    },
    {
      key: "collection_planning",
      label: "系列规划",
      instruction: "Focus on the recipient's likely collection-planning needs and timing. Offer a focused next step rather than a broad catalogue dump.",
    },
    {
      key: "production_value",
      label: "开发与生产价值",
      instruction: "Focus on development, fabric sourcing, quality consistency or production reliability, selecting only the capability most relevant to this customer.",
    },
    {
      key: "reengagement",
      label: "低压力重新联系",
      instruction: "Write a short, low-pressure re-engagement note that adds a new reason to reply. Do not merely ask whether the previous email was seen.",
    },
  ];
  const seed = customer.company.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return rotating[(seed + sentCount) % rotating.length];
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
  const messagingProfile = buildCustomerMessagingProfile(customer);
  const emailStrategy = selectCustomerEmailStrategy(customer, followUps, messages, signals);
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
    `Requested purpose for this email: ${clean(purpose, 1000) || "Start or continue a commercially useful conversation"}`,
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

  const recentOutboundWording = chronologicalMessages(messages)
    .filter((item) => item.direction === "sent")
    .slice(-3)
    .map((item, index) => `${index + 1}. Subject: ${clean(item.subject, 220)}\nOpening/body excerpt: ${clean(item.content || item.snippet, 700)}`)
    .join("\n\n") || "None";

  const signalHistory = signals.length
    ? signals.map((item, index) => [
      `${index + 1}. ${clean(item.title, 500)} | relevance ${item.relevance_score}`,
      clean(item.summary, 1200) || "No summary",
      `Published: ${item.published_at || "Unknown"}; source: ${clean(item.source_url, 700)}`,
    ].join("\n")).join("\n\n")
    : "None";

  return [
    `EMAIL ALGORITHM VERSION: ${CUSTOMER_EMAIL_ALGORITHM_VERSION}`,
    "SELECTED EMAIL STRATEGY",
    `${emailStrategy.label}: ${emailStrategy.instruction}`,
    "Strategy hierarchy: an unanswered customer email always outranks market news, CRM assumptions and the requested sales purpose.",
    "Do not repeat the subject, opening sentence, main proof point or call to action used in recent outbound emails.",
    "",
    "RESOLVED CUSTOMER COMMUNICATION PROFILE",
    roleSpecificWritingRules(messagingProfile),
    `Verified background summary: ${messagingProfile.verifiedBackground}`,
    "Use this profile to choose the recipient vocabulary and commercial angle. Never copy internal field names into the message.",
    "",
    "CUSTOMER PROFILE",
    customerProfile,
    "",
    "CRM FOLLOW-UP HISTORY (newest first)",
    crmHistory,
    "",
    "MATCHED GMAIL HISTORY (oldest first)",
    gmailHistory,
    "",
    "RECENT OUTBOUND WORDING TO AVOID REPEATING",
    recentOutboundWording,
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
  const profile = buildCustomerMessagingProfile(customer);
  const latestReceived = [...messages].reverse().find((item) => item.direction === "received");
  const hasCommunication = messages.length > 0 || followUps.length > 0;
  const company = englishReference(customer.company, "your business", 240);
  const requestedPurpose = englishReference(purpose, "", 500);
  const latestSubject = englishReference(latestReceived?.subject, "", 500);

  const subject = latestReceived && latestSubject
    ? `Re: ${latestSubject.replace(/^re:\s*/i, "")}`
    : hasCommunication
      ? `Occasionwear development for ${company}`
      : profile.archetype === "brand"
        ? `Collection development for ${company}`
        : `Occasionwear opportunity for ${company}`;

  const opening = latestReceived
    ? `Thank you for your earlier message about ${latestSubject || "our possible cooperation"}. I wanted to continue from that conversation.`
    : hasCommunication
      ? `I wanted to continue our earlier conversation with something relevant to ${company}.`
      : profile.archetype === "unknown"
        ? `I am contacting ${company} to understand whether you work with external production partners for occasionwear.`
        : `${company}'s position as a ${profile.archetypeLabel} appears relevant to our work in ${profile.productOpportunity}.`;

  const purposeLine = requestedPurpose
    ? `For this note, I would like to discuss ${requestedPurpose}.`
    : profile.archetype === "brand"
      ? "Are you currently developing an upcoming occasionwear collection or reviewing additional production capabilities?"
      : profile.archetype === "importer_distributor"
        ? "Are you currently reviewing new occasionwear lines or additional production partners for an upcoming buying cycle?"
        : "Would a focused product discussion around your current occasionwear assortment be useful?";

  const nextStep = profile.archetype === "brand"
    ? "If relevant, I can share a concise introduction to our development capabilities, suitable product examples and production approach."
    : profile.archetype === "importer_distributor"
      ? "If relevant, I can prepare a focused collection overview with commercial positioning and production lead-time information."
      : "If relevant, I can prepare a focused selection and explain how it could complement your current occasionwear assortment.";

  const body = [
    "Dear Team,",
    "",
    opening,
    "",
    `The most relevant opportunity appears to be ${profile.productOpportunity}. We ${profile.valueProposition}.`,
    purposeLine,
    "",
    nextStep,
  ].join("\n");

  return { subject, body: appendSalesSignature(body), source: "template" as const };
}
