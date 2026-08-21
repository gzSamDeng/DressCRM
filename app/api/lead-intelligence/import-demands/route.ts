import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eveningDressTemplate } from "@/lib/lead-intelligence/evening-dress";
import { isStoredBuyerDemandValid, searchBuyerDemands } from "@/lib/lead-intelligence/buyer-demand";

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data: template } = await supabase.from("intelligence_templates").select("id")
    .eq("market", eveningDressTemplate.market).eq("is_active", true).limit(1).single();
  if (!template) return NextResponse.json({ error: "请先执行 AI Lead Intelligence 数据库迁移。" }, { status: 503 });

  const { data: job, error: jobError } = await supabase.from("search_jobs").insert({
    template_id: template.id, query: "全球公开 RFQ 与采购需求 · Evening Dress",
    connector: "serper_public_buyer_demand", status: "running", minimum_score: 60,
    started_at: new Date().toISOString(),
  }).select("id").single();
  if (jobError || !job) return NextResponse.json({ error: jobError?.message ?? "无法创建监测任务。" }, { status: 500 });

  try {
    const { data: pendingDemandRows, error: pendingDemandError } = await supabase
      .from("discovered_leads")
      .select("id,source_url,evidence")
      .eq("lead_source", "buyer_demand")
      .eq("review_status", "pending");
    if (pendingDemandError) throw new Error(pendingDemandError.message);
    const invalidDemandIds = (pendingDemandRows ?? [])
      .filter((row) => !isStoredBuyerDemandValid(row))
      .map((row) => row.id);
    if (invalidDemandIds.length) {
      const { error: cleanupError } = await supabase.from("discovered_leads").update({
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: authData.user.id,
        recommendation: "系统复核：标题未同时包含礼服产品和明确采购动作，或来源不是可核验的具体询盘页，已自动移出待审核列表。",
      }).in("id", invalidDemandIds);
      if (cleanupError) throw new Error(cleanupError.message);
    }

    const searchResult = await searchBuyerDemands();
    const demands = searchResult.demands;
    const keys = demands.map((demand) => demand.sourceKey);
    const existingResult = keys.length
      ? await supabase.from("discovered_leads").select("source_key").in("source_key", keys)
      : { data: [], error: null };
    if (existingResult.error) throw new Error(existingResult.error.message);
    const knownKeys = new Set((existingResult.data ?? []).map((row) => row.source_key));
    const newDemands = demands.filter((demand) => !knownKeys.has(demand.sourceKey));

    if (newDemands.length) {
      const { error: insertError } = await supabase.from("discovered_leads").insert(newDemands.map((demand) => ({
        source_key: demand.sourceKey, search_job_id: job.id, company: demand.company, website: null,
        country: demand.country, customer_type: demand.customerType, ai_score: demand.score, ai_grade: demand.grade,
        confidence: demand.confidence, signals: demand.signals, evidence: demand.evidence, risks: demand.risks,
        recommendation: demand.recommendation, source_url: demand.sourceUrl, review_status: "pending",
        contact_name: demand.contactName, exhibitor_source: `采购需求 · ${demand.platform}`,
        contact_sources: [{ kind: "采购需求原文", url: demand.sourceUrl }],
        data_completeness: demand.contactName ? 55 : demand.country ? 40 : 30, lead_source: "buyer_demand",
      })));
      if (insertError) throw new Error(insertError.message);
    }

    await supabase.from("search_jobs").update({ status: "complete", candidates_found: demands.length,
      completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ candidatesFound: demands.length, insertedCount: newDemands.length,
      duplicateCount: demands.length - newDemands.length, warnings: searchResult.warnings,
      successfulQueries: searchResult.successfulQueries, failedQueries: searchResult.failedQueries,
      rejectedInvalidCount: invalidDemandIds.length,
      verificationRejectedCount: searchResult.verificationRejectedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "采购需求监测失败。";
    await supabase.from("search_jobs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
