import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { enrichExhibitor } from "@/lib/lead-intelligence/exhibitor-enrichment";
import { isExcludedLead } from "@/lib/lead-intelligence/exclusions";
import exhibitorData from "@/data/if-wedding-exhibitors.json";

export const maxDuration = 60;
const sourceName = "IF Wedding Fashion İzmir 2026 B Hall";
const jobQuery = "IF Wedding Fashion İzmir 2026 B Hall exhibitors";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { offset?: number; limit?: number };
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const limit = Math.min(5, Math.max(1, Number(body.limit ?? 4) || 4));
  const seeds = exhibitorData.slice(offset, offset + limit);
  if (!seeds.length) return NextResponse.json({ complete: true, processed: 0, total: exhibitorData.length });

  const { data: template } = await supabase.from("intelligence_templates").select("id")
    .eq("market", eveningDressTemplate.market).eq("is_active", true).limit(1).single();
  if (!template) return NextResponse.json({ error: "AI 获客模板不存在，请先执行数据库迁移。" }, { status: 503 });
  let { data: job } = await supabase.from("search_jobs").select("id")
    .eq("query", jobQuery).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!job) {
    const created = await supabase.from("search_jobs").insert({
      template_id: template.id, query: jobQuery, connector: "Serper + official exhibitor directory",
      status: "running", minimum_score: 0, started_at: new Date().toISOString(),
    }).select("id").single();
    if (created.error || !created.data) return NextResponse.json({ error: created.error?.message ?? "无法创建导入任务。" }, { status: 500 });
    job = created.data;
  }

  const enriched = await Promise.all(seeds.map((seed) => enrichExhibitor(seed)));
  const payload = enriched
    .filter((lead) => !isExcludedLead({
      company: lead.company,
      website: lead.website,
      contactEmail: lead.contactEmail,
    }))
    .map((lead) => ({
    source_key: lead.id,
    search_job_id: job!.id,
    company: lead.company,
    website: lead.website || null,
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
    contact_name: lead.contactName || null,
    contact_email: lead.contactEmail || null,
    contact_phone: lead.contactPhone || null,
    whatsapp: lead.whatsapp || null,
    instagram: lead.instagram || null,
    facebook: lead.facebook || null,
    linkedin: lead.linkedin || null,
    address: lead.address || null,
    exhibitor_source: sourceName,
    contact_sources: lead.contactSources,
    data_completeness: lead.dataCompleteness,
    review_status: "pending",
    }));
  const { error } = await supabase.from("discovered_leads").upsert(payload, { onConflict: "source_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nextOffset = offset + seeds.length;
  const complete = nextOffset >= exhibitorData.length;
  const { count } = await supabase.from("discovered_leads").select("id", { count: "exact", head: true }).eq("exhibitor_source", sourceName);
  await supabase.from("search_jobs").update({
    status: complete ? "complete" : "running",
    candidates_found: count ?? nextOffset,
    completed_at: complete ? new Date().toISOString() : null,
  }).eq("id", job.id);
  return NextResponse.json({ processed: seeds.length, nextOffset, total: exhibitorData.length, complete, imported: count ?? nextOffset });
}
