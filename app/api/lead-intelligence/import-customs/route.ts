import { NextResponse } from "next/server";
import customsReport from "@/data/customs-evening-dress-imports.generated.json";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { enrichCustomsLead } from "@/lib/lead-intelligence/customs-enrichment";

export const maxDuration = 60;

const sourceLabel = "中国出口礼服海关进口数据";
const jobQuery = "China Evening Dress Customs Import Data 2026-08-10";

function normalizedDomain(value: string | null | undefined) {
  if (!value) return "";
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const limit = Math.min(4, Math.max(1, Number(body.limit ?? 2) || 2));
  const seeds = customsReport.leads.slice(offset, offset + limit);
  if (!seeds.length) return NextResponse.json({ complete: true, processed: 0, total: customsReport.leads.length });

  const { data: template } = await supabase.from("intelligence_templates").select("id")
    .eq("market", eveningDressTemplate.market).eq("is_active", true).limit(1).single();
  if (!template) return NextResponse.json({ error: "请先执行数据库迁移并确认 AI 行业模板存在。" }, { status: 503 });
  let { data: job } = await supabase.from("search_jobs").select("id").eq("query", jobQuery).limit(1).maybeSingle();
  if (!job) {
    const created = await supabase.from("search_jobs").insert({
      template_id: template.id,
      query: jobQuery,
      connector: "Customs data + Serper + public website evidence",
      status: "running",
      minimum_score: 35,
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (created.error || !created.data) return NextResponse.json({ error: created.error?.message ?? "无法创建导入任务。" }, { status: 500 });
    job = created.data;
  }

  const [{ data: customers }, { data: discovered }] = await Promise.all([
    supabase.from("customers").select("id,company,website,contact_email"),
    supabase.from("discovered_leads").select("id,source_key,company,website,customer_id,review_status,lead_source"),
  ]);
  let imported = 0;
  let skipped = 0;
  for (const seed of seeds) {
    const enrichment = await enrichCustomsLead(seed);
    if (!enrichment.shouldImport) { skipped += 1; continue; }
    const domain = normalizedDomain(enrichment.website);
    const name = normalizedName(seed.company);
    const matchedCustomer = (customers ?? []).find((row) =>
      (domain && normalizedDomain(row.website) === domain)
      || normalizedName(row.company) === name,
    );
    const existingLead = (discovered ?? []).find((row) =>
      row.source_key === seed.source_key || normalizedName(row.company) === name,
    );
    const leadPayload = {
      search_job_id: job.id,
      source_key: existingLead?.source_key ?? seed.source_key,
      company: seed.company,
      website: enrichment.website || null,
      country: seed.country,
      city: null,
      customer_type: enrichment.customerType,
      ai_score: enrichment.score,
      ai_grade: enrichment.grade,
      confidence: enrichment.dataCompleteness >= 70 ? "High" : enrichment.dataCompleteness >= 50 ? "Medium" : "Low",
      signals: ["customs_import", seed.shipment_count > 1 ? "repeat_importer" : "single_import_record"],
      evidence: enrichment.evidence,
      risks: enrichment.risks,
      recommendation: seed.shipment_count > 1
        ? `重点审核：已有 ${seed.shipment_count} 次礼服进口记录，建议结合最近进口日期制定跟进计划。`
        : "审核海关进口记录与官网经营背景后，再确认采购联系人。",
      source_url: enrichment.sourceUrl || null,
      contact_email: enrichment.contactEmail || null,
      contact_phone: enrichment.contactPhone || null,
      whatsapp: enrichment.whatsapp || null,
      instagram: enrichment.instagram || null,
      facebook: enrichment.facebook || null,
      linkedin: enrichment.linkedin || null,
      exhibitor_source: sourceLabel,
      contact_sources: enrichment.evidence.slice(1),
      data_completeness: enrichment.dataCompleteness,
      review_status: existingLead?.review_status ?? "pending",
      customer_id: matchedCustomer?.id ?? existingLead?.customer_id ?? null,
      lead_source: existingLead?.lead_source ?? "customs_import",
      customs_import_count: seed.shipment_count,
      first_customs_import_at: seed.first_import_date,
      latest_customs_import_at: seed.latest_import_date,
      customs_source_label: sourceLabel,
    };
    const leadResult = existingLead
      ? await supabase.from("discovered_leads").update(leadPayload).eq("id", existingLead.id).select("id").single()
      : await supabase.from("discovered_leads").insert(leadPayload).select("id").single();
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: leadResult.error?.message ?? `无法保存 ${seed.company}` }, { status: 500 });
    const recordPayload = seed.records.map((record) => ({
      record_fingerprint: record.record_fingerprint,
      discovered_lead_id: leadResult.data.id,
      customer_id: matchedCustomer?.id ?? existingLead?.customer_id ?? null,
      import_date: record.import_date,
      importer_country: record.importer_country,
      importer_name_raw: record.importer_name,
      seller_country: record.seller_country,
      supplier_name: record.supplier_name,
      origin_country: record.origin_country,
      hs_code: record.hs_code,
      product_description: record.product_description,
      trade_type: record.trade_type,
      quantity_raw: record.quantity_raw,
      amount_raw: record.amount_raw,
      weight_raw: record.weight_raw,
      source_label: sourceLabel,
      review_status: existingLead?.review_status ?? "pending",
    }));
    const recordsResult = await supabase.from("customs_import_records").upsert(recordPayload, { onConflict: "record_fingerprint" });
    if (recordsResult.error) return NextResponse.json({ error: recordsResult.error.message }, { status: 500 });
    imported += 1;
  }

  const nextOffset = offset + seeds.length;
  const complete = nextOffset >= customsReport.leads.length;
  const { count } = await supabase.from("discovered_leads").select("id", { count: "exact", head: true }).eq("lead_source", "customs_import");
  await supabase.from("search_jobs").update({
    status: complete ? "complete" : "running",
    candidates_found: count ?? 0,
    completed_at: complete ? new Date().toISOString() : null,
  }).eq("id", job.id);
  return NextResponse.json({ processed: seeds.length, imported, skipped, nextOffset, total: customsReport.leads.length, complete, totalImported: count ?? 0 });
}
