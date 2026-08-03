import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

type NewsItem = { title?: string; link?: string; snippet?: string; date?: string; source?: string };
type NewsResponse = { news?: NewsItem[]; message?: string };

const opportunityPatterns = [
  /china|chinese supplier|sourcing|supply chain|supplier|import|procurement/i,
  /expand|expansion|new store|new collection|growth|partnership|distribution/i,
  /evening|occasion|dress|fashion|boutique|couture|bridal/i,
];

function relevance(item: NewsItem) {
  const text = `${item.title ?? ""} ${item.snippet ?? ""}`;
  return Math.min(100, 25 + opportunityPatterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 22 : 0), 0));
}

export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未配置 SERPER_API_KEY。" }, { status: 503 });
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id,company,website,priority")
    .in("priority", ["A+", "A"])
    .order("priority")
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let signalsSaved = 0;
  for (const customer of customers ?? []) {
    let domain = "";
    try {
      domain = customer.website ? new URL(customer.website).hostname.replace(/^www\./, "") : "";
    } catch {
      domain = customer.website?.replace(/^https?:\/\//, "").split("/")[0] ?? "";
    }
    const response = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `\"${customer.company}\" ${domain} (supplier OR sourcing OR China OR expansion OR partnership OR collection)`, num: 5, gl: "us", hl: "en" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) continue;
    const body = (await response.json()) as NewsResponse;
    const rows = (body.news ?? []).filter((item) => item.link && item.title).map((item) => ({
      customer_id: customer.id,
      title: item.title!,
      summary: item.snippet ?? null,
      source_url: item.link!,
      signal_type: "news",
      relevance_score: relevance(item),
    })).filter((item) => item.relevance_score >= 47);
    if (!rows.length) continue;
    const { data: saved } = await supabase.from("customer_signals").upsert(rows, { onConflict: "customer_id,source_url", ignoreDuplicates: true }).select("id");
    signalsSaved += saved?.length ?? 0;
  }
  return NextResponse.json({ customersChecked: customers?.length ?? 0, signalsSaved });
}
