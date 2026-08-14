import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { isExcludedLead, normalizedDomain } from "@/lib/lead-intelligence/exclusions";
import fairLeadReport from "@/data/turkey-fair-evening-dress-leads.json";

export const maxDuration = 60;

const sourceName = fairLeadReport.source;
const jobQuery = "Turkey fair calendars → verified evening-dress exhibitors · 2026-08-14";

type FairLead = (typeof fairLeadReport.leads)[number];

function normalizeCompany(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[çÇ]/g, "c")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .toLowerCase()
    .replace(/\b(teks|tekstil|giyim|san|tic|ltd|sti|as|group|fashion|moda|collection)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function companyMatches(lead: FairLead, existingCompany: string | null | undefined) {
  const existing = normalizeCompany(existingCompany);
  if (!existing) return false;
  return [lead.company, ...lead.aliases].some((alias) => {
    const candidate = normalizeCompany(alias);
    return candidate.length >= 4
      && (candidate === existing || candidate.includes(existing) || existing.includes(candidate));
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  const [{ data: existingLeads, error: leadError }, { data: customers, error: customerError }] = await Promise.all([
    supabase.from("discovered_leads").select("source_key,company,website,contact_email,review_status"),
    supabase.from("customers").select("id,company,website,contact_email,is_excluded"),
  ]);
  if (leadError || customerError) {
    return NextResponse.json({ error: leadError?.message ?? customerError?.message }, { status: 500 });
  }

  const allExisting = [...(existingLeads ?? []), ...(customers ?? [])];
  const knownSourceKeys = new Set((existingLeads ?? []).map((row) => row.source_key).filter(Boolean));
  const knownDomains = new Set(allExisting.map((row) => normalizedDomain(row.website)).filter(Boolean));
  const knownEmails = new Set(
    allExisting.map((row) => row.contact_email?.trim().toLowerCase()).filter(Boolean),
  );

  const duplicateReasons = new Map<string, string>();
  const newLeads = fairLeadReport.leads.filter((lead) => {
    if (knownSourceKeys.has(lead.source_key)) {
      duplicateReasons.set(lead.source_key, "source_key");
      return false;
    }
    const domain = normalizedDomain(lead.website);
    if (domain && knownDomains.has(domain)) {
      duplicateReasons.set(lead.source_key, `domain:${domain}`);
      return false;
    }
    const email = lead.contact_email.trim().toLowerCase();
    if (email && knownEmails.has(email)) {
      duplicateReasons.set(lead.source_key, `email:${email}`);
      return false;
    }
    const companyMatch = allExisting.find((row) => companyMatches(lead, row.company));
    if (companyMatch) {
      duplicateReasons.set(lead.source_key, `company:${companyMatch.company}`);
      return false;
    }
    if (isExcludedLead({ company: lead.company, website: lead.website, contactEmail: lead.contact_email })) {
      duplicateReasons.set(lead.source_key, "excluded");
      return false;
    }
    return true;
  });

  const duplicates = fairLeadReport.leads
    .filter((lead) => duplicateReasons.has(lead.source_key))
    .map((lead) => ({ company: lead.company, reason: duplicateReasons.get(lead.source_key) }));

  if (body.dryRun) {
    return NextResponse.json({
      source: sourceName,
      reviewed: fairLeadReport.leads.length,
      newCount: newLeads.length,
      newCompanies: newLeads.map((lead) => lead.company),
      duplicates,
    });
  }

  if (!newLeads.length) {
    return NextResponse.json({ source: sourceName, reviewed: fairLeadReport.leads.length, inserted: 0, duplicates });
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
      connector: "Official TOBB calendar + official exhibitor directories + public contacts",
      status: "running",
      minimum_score: 60,
      started_at: new Date().toISOString(),
    }).select("id").single();
    if (created.error || !created.data) {
      return NextResponse.json({ error: created.error?.message ?? "无法创建展会搜索任务。" }, { status: 500 });
    }
    job = created.data;
  }

  const payload = newLeads.map((lead) => ({
    source_key: lead.source_key,
    search_job_id: job!.id,
    company: lead.company,
    website: lead.website || null,
    country: lead.country,
    city: lead.city,
    customer_type: lead.customer_type,
    ai_score: lead.ai_score,
    ai_grade: lead.ai_grade,
    confidence: lead.confidence,
    signals: lead.signals,
    evidence: lead.evidence,
    risks: lead.risks,
    recommendation: lead.recommendation,
    source_url: lead.source_url,
    contact_email: lead.contact_email || null,
    contact_phone: lead.contact_phone || null,
    whatsapp: lead.whatsapp || null,
    instagram: lead.instagram || null,
    exhibitor_source: sourceName,
    contact_sources: lead.contact_sources,
    data_completeness: Math.min(100,
      (lead.website ? 20 : 0)
      + (lead.contact_email ? 30 : 0)
      + (lead.contact_phone ? 25 : 0)
      + (lead.whatsapp ? 10 : 0)
      + (lead.telegram || lead.instagram ? 10 : 0)
      + (lead.contact_sources.length >= 3 ? 5 : 0)),
    review_status: "pending",
  }));

  const { error: insertError } = await supabase.from("discovered_leads").insert(payload);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase.from("search_jobs").update({
    status: "complete",
    candidates_found: newLeads.length,
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);

  return NextResponse.json({
    source: sourceName,
    reviewed: fairLeadReport.leads.length,
    inserted: newLeads.length,
    insertedCompanies: newLeads.map((lead) => lead.company),
    duplicates,
  });
}
