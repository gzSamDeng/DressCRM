import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import globalLeadReport from "@/data/global-evening-dress-leads.generated.json";

export const maxDuration = 60;

const sourceName = "全球晚礼服买家搜索 · 2026-08-08";
const jobQuery = "Global Evening Dress Buyer Search 2026-08-08";
const oneTimeImportKey = "bf-global-8e0a15da8b944906b436ba7d68eb5769";

function normalizedDomain(website: string | null | undefined) {
  if (!website) return "";
  try {
    return new URL(website).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: auth } = await sessionClient.auth.getUser();
  const importKey = request.headers.get("x-import-key");
  const authorizedJob = Boolean(importKey && (
    (process.env.SERPER_API_KEY && importKey === process.env.SERPER_API_KEY) || importKey === oneTimeImportKey
  ));
  if (!auth.user && !authorizedJob) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const supabase = authorizedJob ? createAdminClient() : sessionClient;

  const body = (await request.json().catch(() => ({}))) as { offset?: number; limit?: number };
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(body.limit ?? 25) || 25));
  const seeds = globalLeadReport.leads.slice(offset, offset + limit);
  if (!seeds.length) {
    return NextResponse.json({ complete: true, processed: 0, total: globalLeadReport.leads.length });
  }

  const { data: template } = await supabase.from("intelligence_templates").select("id")
    .eq("market", eveningDressTemplate.market).eq("is_active", true).limit(1).single();
  if (!template) return NextResponse.json({ error: "AI 获客模板不存在，请先执行数据库迁移。" }, { status: 503 });

  let { data: job } = await supabase.from("search_jobs").select("id")
    .eq("query", jobQuery).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!job) {
    const created = await supabase.from("search_jobs").insert({
      template_id: template.id,
      query: jobQuery,
      connector: "Serper + official website evidence",
      status: "running",
      minimum_score: 56,
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (created.error || !created.data) {
      return NextResponse.json({ error: created.error?.message ?? "无法创建全球搜索任务。" }, { status: 500 });
    }
    job = created.data;
  }

  const [{ data: existingLeads }, { data: customers }] = await Promise.all([
    supabase.from("discovered_leads").select("source_key,website"),
    supabase.from("customers").select("website"),
  ]);
  const knownSourceKeys = new Set((existingLeads ?? []).map((row) => row.source_key).filter(Boolean));
  const knownDomains = new Set(
    [...(existingLeads ?? []), ...(customers ?? [])]
      .map((row) => normalizedDomain(row.website))
      .filter(Boolean),
  );
  const newSeeds = seeds.filter((lead) =>
    !knownSourceKeys.has(lead.source_key) && !knownDomains.has(normalizedDomain(lead.website)),
  );

  if (newSeeds.length) {
    const payload = newSeeds.map((lead) => ({
      source_key: lead.source_key,
      search_job_id: job!.id,
      company: lead.company,
      website: lead.website || null,
      country: lead.country,
      city: lead.city || null,
      customer_type: lead.customer_type,
      ai_score: lead.ai_score,
      ai_grade: lead.ai_grade,
      confidence: lead.confidence[0].toUpperCase() + lead.confidence.slice(1),
      signals: [
        ...Object.entries(lead.signals).filter(([, enabled]) => enabled).map(([signal]) => signal),
        ...lead.product_lines.map((line) => `product_line_${line}`),
      ],
      evidence: lead.evidence.map((item) =>
        [item.title, item.snippet, item.url].filter(Boolean).join(" — "),
      ),
      risks: lead.risks,
      recommendation: lead.recommendation,
      source_url: lead.source_url,
      contact_email: lead.contact_email || null,
      contact_phone: lead.contact_phone || null,
      whatsapp: lead.whatsapp || null,
      exhibitor_source: sourceName,
      contact_sources: lead.contact_sources,
      data_completeness: lead.data_completeness,
      review_status: "pending",
    }));
    const { error } = await supabase.from("discovered_leads").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextOffset = offset + seeds.length;
  const complete = nextOffset >= globalLeadReport.leads.length;
  const { count } = await supabase.from("discovered_leads")
    .select("id", { count: "exact", head: true }).eq("exhibitor_source", sourceName);
  await supabase.from("search_jobs").update({
    status: complete ? "complete" : "running",
    candidates_found: count ?? 0,
    completed_at: complete ? new Date().toISOString() : null,
  }).eq("id", job.id);

  return NextResponse.json({
    processed: seeds.length,
    inserted: newSeeds.length,
    skippedAsDuplicate: seeds.length - newSeeds.length,
    nextOffset,
    total: globalLeadReport.leads.length,
    complete,
    imported: count ?? 0,
  });
}
