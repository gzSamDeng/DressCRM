import { NextResponse } from "next/server";
import { getGmailAccount, listCustomerMessages } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";

function templateDraft(customer: Customer, followUps: FollowUp[], purpose: string) {
  const hasHistory = followUps.length > 0;
  const subject = hasHistory
    ? `Following up on our evening dress cooperation with ${customer.company}`
    : `Evening dress collection opportunity for ${customer.company}`;
  const context = hasHistory
    ? "I am following up on our previous communication and wanted to share a concise update."
    : `I came across ${customer.company} and believe our evening dress collection may fit your market and customer positioning.`;
  const body = [
    "Dear Team,",
    "",
    context,
    "",
    "We specialize in premium evening dresses with flexible order quantities, stable production and styles suitable for boutiques, importers and distributors.",
    purpose ? `For this follow-up, I would especially like to discuss ${purpose}.` : "Would you be open to reviewing a short catalogue and discussing your current buying plan?",
    "",
    "If this is relevant, I can send selected styles, wholesale prices and lead-time details based on your market.",
    "",
    "Best regards,",
  ].join("\n");
  return { subject, body, source: "template" as const };
}

function responseText(data: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return (data.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
    const payload = await request.json() as { customer_id?: string; purpose?: string };
    if (!payload.customer_id) return NextResponse.json({ error: "请先选择客户。" }, { status: 400 });

    const [{ data: customerData, error: customerError }, { data: followUpData }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", payload.customer_id).single(),
      supabase.from("follow_ups").select("*").eq("customer_id", payload.customer_id).order("happened_at", { ascending: false }).limit(5),
    ]);
    if (customerError || !customerData) return NextResponse.json({ error: "客户线索不存在。" }, { status: 404 });
    const customer = customerData as Customer;
    const followUps = (followUpData ?? []) as FollowUp[];
    const fallback = templateDraft(customer, followUps, payload.purpose?.trim() || "");
    if (!process.env.OPENAI_API_KEY) return NextResponse.json(fallback);

    let emailHistory = "None";
    try {
      const account = await getGmailAccount(supabase, auth.user.id);
      if (account) {
        const messages = await listCustomerMessages(supabase, account, [customer]);
        emailHistory = messages.slice(0, 5).map((item) =>
          `${item.date} · ${item.direction} · ${item.subject} · ${item.snippet.slice(0, 500)}`
        ).join(" | ") || "None";
      }
    } catch {
      // CRM history remains enough to create a safe fallback draft.
    }

    const prompt = [
      "Write a concise B2B export sales follow-up email in natural English.",
      "Return JSON only with string fields subject and body.",
      "Do not invent facts, discounts, certifications or past conversations.",
      `Company: ${customer.company}`,
      `Country: ${customer.country || "Unknown"}`,
      `Customer type: ${customer.customer_type || "Unknown"}`,
      `Priority: ${customer.priority}`,
      `Product fit: ${customer.recommended_line || customer.product_category || "Evening dresses"}`,
      `Purpose: ${payload.purpose?.trim() || "Introduce the collection and ask about the buying plan"}`,
      `Recent CRM follow-ups: ${followUps.map((item) => `${item.happened_at}: ${item.summary} (${item.outcome || "no result"})`).join(" | ") || "None"}`,
      `Recent matched Gmail messages: ${emailHistory}`,
    ].join("\n");
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: 700,
      }),
      cache: "no-store",
    });
    if (!aiResponse.ok) return NextResponse.json(fallback);
    const text = responseText(await aiResponse.json()).replace(/^```json\s*|\s*```$/g, "").trim();
    const draft = JSON.parse(text) as { subject?: string; body?: string };
    if (!draft.subject || !draft.body) return NextResponse.json(fallback);
    return NextResponse.json({ subject: draft.subject, body: draft.body, source: "ai" });
  } catch {
    return NextResponse.json({ error: "草稿生成失败，请稍后重试。" }, { status: 500 });
  }
}
