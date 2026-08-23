import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { scoreLead } from "@/lib/lead-intelligence/score";
import { searchWithSerper } from "@/lib/lead-intelligence/serper-connector";
import { isExcludedLead, normalizedDomain } from "@/lib/lead-intelligence/exclusions";

export const maxDuration = 60;

const markets = {
  "United States": { gl: "us", location: "United States" },
  Canada: { gl: "ca", location: "Canada" },
  "United Kingdom": { gl: "gb", location: "United Kingdom" },
  Germany: { gl: "de", location: "Germany" },
  France: { gl: "fr", location: "France" },
  Spain: { gl: "es", location: "Spain" },
  Italy: { gl: "it", location: "Italy" },
  Netherlands: { gl: "nl", location: "Netherlands" },
  Poland: { gl: "pl", location: "Poland" },
  Romania: { gl: "ro", location: "Romania" },
  Greece: { gl: "gr", location: "Greece" },
  Russia: { gl: "ru", location: "Russia" },
  Australia: { gl: "au", location: "Australia" },
  "New Zealand": { gl: "nz", location: "New Zealand" },
  "United Arab Emirates": { gl: "ae", location: "United Arab Emirates" },
  "Saudi Arabia": { gl: "sa", location: "Saudi Arabia" },
  Turkey: { gl: "tr", location: "Turkey" },
} as const;

const marketPacks: Record<string, Array<keyof typeof markets>> = {
  global_priority: ["United States", "Canada", "United Kingdom", "Germany", "France", "Australia", "New Zealand", "Russia"],
  north_america: ["United States", "Canada"],
  europe: ["United Kingdom", "Germany", "France", "Spain", "Italy", "Netherlands", "Poland", "Romania", "Greece"],
  australia_nz: ["Australia", "New Zealand"],
  russia: ["Russia"],
  gulf: ["United Arab Emirates", "Saudi Arabia"],
  turkey: ["Turkey"],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    query?: string;
    minimumScore?: number;
    marketPack?: string;
    mode?: "incremental" | "bootstrap" | "full";
  };
  const minimumScore = Math.min(100, Math.max(0, Number(body.minimumScore ?? 45)));
  const baseQuery = body.query?.trim() || "evening dress buyer";
  const selectedMarkets = marketPacks[body.marketPack ?? "global_priority"] ?? marketPacks.global_priority;
  // `full` is accepted temporarily for compatibility with an older deployed UI.
  const mode = body.mode === "bootstrap" || body.mode === "full" ? "bootstrap" : "incremental";
  const intents = mode === "bootstrap"
    ? [
      "evening dress boutique retailer",
      "plus size evening dress boutique",
      "luxury beaded evening gown boutique",
    ]
    : [
      "evening dress boutique retailer",
      "luxury beaded evening gown boutique",
    ];
  const pagesPerQuery = mode === "bootstrap" ? 2 : 1;
  const queries = selectedMarkets.flatMap((country) => intents.map((intent) => ({
    query: `${baseQuery} ${intent} ${country}`,
    country,
    ...markets[country],
  })));

  const { data: template } = await supabase
    .from("intelligence_templates")
    .select("id")
    .eq("market", eveningDressTemplate.market)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!template) return NextResponse.json({ error: "请先执行 AI Lead Intelligence 数据库迁移。" }, { status: 503 });

  const { data: job, error: jobError } = await supabase
    .from("search_jobs")
    .insert({
      template_id: template.id,
      query: `${baseQuery} · ${selectedMarkets.join(", ")} (${mode === "bootstrap" ? "首次初始化建库" : "日常增量扫描"})`,
      connector: "serper",
      status: "running",
      minimum_score: minimumScore,
      candidates_found: 0,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) return NextResponse.json({ error: jobError?.message ?? "无法创建搜索任务。" }, { status: 500 });

  try {
    const candidates = await searchWithSerper(queries, { pagesPerQuery });
    const [{ data: customerRows }, { data: discoveredRows }] = await Promise.all([
      supabase.from("customers").select("website"),
      supabase.from("discovered_leads").select("website"),
    ]);
    const knownWebsites = new Set(
      [...(customerRows ?? []), ...(discoveredRows ?? [])]
        .map((row) => normalizedDomain(row.website))
        .filter(Boolean),
    );
    const newCandidates = candidates.filter(
      (candidate) => !knownWebsites.has(normalizedDomain(candidate.website)) && !isExcludedLead({
        company: candidate.company,
        website: candidate.website,
      }),
    );
    const qualifiedLeads = newCandidates
      .map(scoreLead)
      .filter((lead) => lead.score >= minimumScore)
      .sort((a, b) => b.score - a.score);

    if (qualifiedLeads.length) {
      const { error: insertError } = await supabase.from("discovered_leads").insert(
        qualifiedLeads.map((lead) => ({
          source_key: `serper:${lead.id}`,
          search_job_id: job.id,
          company: lead.company,
          website: lead.website,
          country: lead.country,
          city: lead.city || null,
          customer_type: lead.customerType,
          ai_score: lead.score,
          ai_grade: lead.grade,
          confidence: lead.confidence,
          signals: lead.signals,
          evidence: lead.evidence,
          risks: lead.risks,
          recommendation: lead.recommendation,
          source_url: lead.sourceUrl,
          review_status: "pending",
          exhibitor_source: "全球市场实时搜索",
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    await supabase.from("search_jobs").update({
      status: "complete",
      candidates_found: qualifiedLeads.length,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({
      jobId: job.id,
      candidatesFound: newCandidates.length,
      qualifiedCount: qualifiedLeads.length,
      leads: qualifiedLeads,
      mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜索失败。";
    await supabase.from("search_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
