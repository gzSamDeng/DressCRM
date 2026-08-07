import { NextResponse } from "next/server";
import {
  buildManualChannelContext,
  channelDraftFallback,
  containsCjk,
  isManualChannel,
} from "@/lib/channel-draft";
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
    const [{ data: customerData }, { data: followUpData }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", payload.customer_id).single(),
      supabase.from("follow_ups").select("*").eq("customer_id", payload.customer_id).order("happened_at", { ascending: false }).limit(12),
    ]);
    if (!customerData) return NextResponse.json({ error: "客户不存在。" }, { status: 404 });
    const customer = customerData as Customer;
    const followUps = (followUpData ?? []) as FollowUp[];
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
            "Be professional, specific, low-pressure and useful to the recipient.",
            "Return plain text only, without Markdown fences.",
          ].join("\n"),
          input: buildManualChannelContext(customer, followUps, payload.channel, purpose),
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          max_output_tokens: 600,
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return NextResponse.json({ draft: fallback, source: "template" });
    const draft = responseText(await response.json()).trim();
    return NextResponse.json({
      draft: draft && !containsCjk(draft) ? draft : fallback,
      source: draft && !containsCjk(draft) ? "ai" : "template",
    });
  } catch {
    return NextResponse.json({ error: "AI 跟进建议生成失败，请稍后重试。" }, { status: 500 });
  }
}
