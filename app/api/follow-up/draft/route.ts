import { NextResponse } from "next/server";
import {
  buildManualChannelContext,
  channelDraftFallback,
  containsCjk,
  isManualChannel,
} from "@/lib/channel-draft";
import type { CustomerSignalContext } from "@/lib/email-draft";
import { listCustomerMessageHistory, type GmailMessageContext } from "@/lib/gmail";
import { getSharedGmailAccount } from "@/lib/shared-gmail";
import {
  buildCustomerMessagingProfile,
  outboundCopyIssues,
} from "@/lib/customer-messaging";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";

function responseText(data: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (data.output_text) return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });

    const payload = await request.json() as { customer_id?: string; channel?: string; purpose?: string };
    if (!payload.customer_id || !payload.channel || !isManualChannel(payload.channel)) {
      return NextResponse.json({ error: "客户或跟进渠道不正确。" }, { status: 400 });
    }
    const [{ data: customerData }, { data: followUpData }, { data: signalData }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", payload.customer_id).single(),
      supabase.from("follow_ups").select("*").eq("customer_id", payload.customer_id).order("happened_at", { ascending: false }).limit(12),
      supabase.from("customer_signals").select("title,summary,source_url,signal_type,relevance_score,published_at").eq("customer_id", payload.customer_id).order("relevance_score", { ascending: false }).limit(5),
    ]);
    if (!customerData) return NextResponse.json({ error: "客户不存在。" }, { status: 404 });
    const customer = customerData as Customer;
    const followUps = (followUpData ?? []) as FollowUp[];
    const signals = (signalData ?? []) as CustomerSignalContext[];
    const messagingProfile = buildCustomerMessagingProfile(customer);
    let messages: GmailMessageContext[] = [];
    try {
      const shared = await getSharedGmailAccount();
      if (shared.account) messages = await listCustomerMessageHistory(shared.supabase, shared.account, customer, 8);
    } catch {
      // CRM history and verified customer evidence remain available when Gmail history cannot be read.
    }
    const purpose = payload.purpose?.trim() || "";
    const fallback = channelDraftFallback(customer, payload.channel, purpose);

    const directOpenAiKey = process.env.OPENAI_API_KEY;
    const gatewayToken = process.env.AI_GATEWAY_API_KEY
      || process.env.VERCEL_OIDC_TOKEN
      || request.headers.get("x-vercel-oidc-token");
    const token = directOpenAiKey || gatewayToken;
    if (!token) return NextResponse.json({ draft: fallback, source: "template" });

    const phoneRules = payload.channel === "Phone"
      ? "Create a concise call plan with an opening, 3-5 discovery questions, likely objections, and a clear next step. Do not write a fake transcript."
      : payload.channel === "Instagram"
        ? "Create one natural Instagram DM of 45-90 words. Make the first sentence customer-specific, use short mobile-friendly paragraphs, do not add a subject line, links, hashtags, a long signature, or ask multiple questions."
        : "Create one concise outreach message suitable for the selected platform, normally 60-130 words. Do not add a subject line.";
    const response = await fetch(
      directOpenAiKey ? "https://api.openai.com/v1/responses" : "https://ai-gateway.vercel.sh/v1/responses",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: directOpenAiKey
            ? process.env.OPENAI_MODEL || "gpt-5.6-terra"
            : process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini",
          instructions: [
            "You help a B2B evening-dress exporter prepare manual customer follow-up.",
            phoneRules,
            "Use only natural English. Silently interpret non-English CRM data; never copy Chinese text or internal CRM scoring into the output.",
            "Use the actual history when relevant, but never invent replies, names, meetings, prices, orders, promises or customer interest.",
            "Classify the recipient from the resolved customer communication profile before writing. Use fashion brand, retailer, apparel company, or importer/distributor language only when it matches that profile.",
            "Never call a fashion brand or retailer an international buyer.",
            "Reference at least one verified customer-specific fact when the profile provides one. Never use the generic opening 'I came across'.",
            "Use the resolved product opportunity rather than generic Premium Evening Dress wording.",
            "For brands, emphasize product development, fabric sourcing, quality consistency and production reliability; do not lead with MOQ.",
            "For retailers, connect the message to their assortment and customers; do not assume importing authority.",
            "Explain the China supply-chain advantage through reliable manufacturers, development capability, stable quality and efficient production.",
            "Never output Both, Unknown, Unclassified, Analyze from existing notes, CRM notes, Buyer DNA, AI Score, Product fit, Recommended line, or other internal field names.",
            "Never reuse the sentence 'We can support selected styles, flexible order quantities and stable production for international buyers'.",
            "Be professional, specific, low-pressure and useful to the recipient.",
            "Return plain text only, without Markdown fences.",
          ].join("\n"),
          input: buildManualChannelContext(customer, followUps, payload.channel, purpose, messages, signals),
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          max_output_tokens: 600,
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return NextResponse.json({ draft: fallback, source: "template" });
    const draft = responseText(await response.json()).trim();
    const copyIssues = outboundCopyIssues(draft, messagingProfile, { requireProductLanguage: true });
    return NextResponse.json({
      draft: draft && !containsCjk(draft) && !copyIssues.length ? draft : fallback,
      source: draft && !containsCjk(draft) && !copyIssues.length ? "ai" : "template",
      quality_fallback: copyIssues,
    });
  } catch {
    return NextResponse.json({ error: "AI 跟进建议生成失败，请稍后重试。" }, { status: 500 });
  }
}
