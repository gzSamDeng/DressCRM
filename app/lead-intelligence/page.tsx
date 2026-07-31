import { Header } from "@/components/header";
import { LeadIntelligenceWorkbench } from "@/components/lead-intelligence-workbench";
import { PendingLeadReview } from "@/components/pending-lead-review";
import { createClient } from "@/lib/supabase/server";
import "./lead-intelligence.css";

export default async function LeadIntelligencePage({ searchParams }: {
  searchParams: Promise<{ reviewPage?: string; reviewStatus?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.reviewPage ?? 1) || 1);
  const status = ["pending", "approved", "rejected"].includes(params.reviewStatus ?? "")
    ? params.reviewStatus!
    : "pending";
  const pageSize = 20;
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("discovered_leads")
    .select("*", { count: "exact" })
    .eq("review_status", status)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(error.message);

  return <div className="shell intelligenceShell"><Header /><main className="intelligenceContainer">
    <LeadIntelligenceWorkbench />
    <PendingLeadReview leads={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} status={status} />
  </main></div>;
}
