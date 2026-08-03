import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { scoreLead } from "@/lib/lead-intelligence/score";
import { searchWithSerper } from "@/lib/lead-intelligence/serper-connector";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { query?: string; minimumScore?: number };
  const minimumScore = Math.min(100, Math.max(0, Number(body.minimumScore ?? 45)));
  const baseQuery = body.query?.trim() || "Turkey evening dress importer boutique";
  const cities = ["Istanbul","Ankara","Izmir","Bursa","Antalya","Adana","Gaziantep","Konya","Mersin","Kayseri","Samsun","Trabzon"];
  const intents = [
    "abiye mağazası butik",
    "lüks abiye tasarım mağazası",
    "toptan abiye distribütör",
    "evening dress boutique",
    "designer occasion wear store",
  ];
  const queries = cities.flatMap((city) =>
    intents.map((intent) => `${baseQuery} ${city} ${intent} -site:instagram.com -site:facebook.com -site:trendyol.com`),
  );

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
      query: baseQuery,
      connector: "serper",
      status: "running",
      minimum_score: minimumScore,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) return NextResponse.json({ error: jobError?.message ?? "无法创建搜索任务。" }, { status: 500 });

  try {
    const candidates = await searchWithSerper(queries);
    const [{ data: customerRows }, { data: discoveredRows }] = await Promise.all([
      supabase.from("customers").select("website"),
      supabase.from("discovered_leads").select("website"),
    ]);
    const knownWebsites = new Set(
      [...(customerRows ?? []), ...(discoveredRows ?? [])]
        .map((row) => row.website?.toLowerCase().replace(/\/$/, ""))
        .filter(Boolean),
    );
    const newCandidates = candidates.filter(
      (candidate) => !knownWebsites.has(candidate.website.toLowerCase().replace(/\/$/, "")),
    );
    const scoredLeads = newCandidates.map(scoreLead).sort((a, b) => b.score - a.score);
    if (scoredLeads.length) {
      const { error: insertError } = await supabase.from("discovered_leads").insert(
        scoredLeads.map((lead) => ({
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
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }
    await supabase.from("search_jobs").update({
      status: "complete",
      candidates_found: newCandidates.length,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({
      jobId: job.id,
      candidatesFound: newCandidates.length,
      qualifiedCount: scoredLeads.filter((lead) => lead.score >= minimumScore).length,
      leads: scoredLeads,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜索失败。";
    await supabase.from("search_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
