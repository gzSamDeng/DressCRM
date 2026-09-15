import { NextResponse } from "next/server";
import { researchCustomerSignals } from "@/lib/customer-research";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Customer } from "@/types/database";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAILY_BATCH_SIZE = 8;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SERPER_API_KEY is not configured." }, { status: 503 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,company,website,country,customer_type,product_category,priority")
    .eq("is_excluded", false)
    .in("priority", ["A+", "A"])
    .order("priority")
    .order("company")
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customers = (data ?? []) as Customer[];
  const batchCount = Math.max(1, Math.ceil(customers.length / DAILY_BATCH_SIZE));
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  const batchIndex = dayNumber % batchCount;
  const batch = customers.slice(batchIndex * DAILY_BATCH_SIZE, (batchIndex + 1) * DAILY_BATCH_SIZE);
  const results = await Promise.allSettled(batch.map((customer) => researchCustomerSignals(customer, apiKey)));

  let signalsFound = 0;
  let signalsSaved = 0;
  let customersFailed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      customersFailed += 1;
      continue;
    }
    signalsFound += result.value.length;
    if (!result.value.length) continue;
    const { data: saved } = await supabase
      .from("customer_signals")
      .upsert(result.value, { onConflict: "customer_id,source_url", ignoreDuplicates: true })
      .select("id");
    signalsSaved += saved?.length ?? 0;
  }

  return NextResponse.json({
    batchIndex,
    batchCount,
    customersChecked: batch.length,
    customersFailed,
    signalsFound,
    signalsSaved,
    completedAt: new Date().toISOString(),
  });
}
