import { NextResponse } from "next/server";
import { researchCustomerSignals } from "@/lib/customer-research";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "尚未配置 SERPER_API_KEY。" }, { status: 503 });

  let payload: { customer_id?: string } = {};
  try {
    payload = await request.json() as { customer_id?: string };
  } catch {
    // The management dashboard intentionally refreshes a batch without a request body.
  }
  let query = supabase
    .from("customers")
    .select("id,company,website,country,customer_type,product_category,priority")
    .eq("is_excluded", false)
    .order("priority")
    .limit(payload.customer_id ? 1 : 12);
  if (payload.customer_id) query = query.eq("id", payload.customer_id);
  else query = query.in("priority", ["A+", "A"]);
  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.allSettled(
    ((customers ?? []) as Customer[]).map((customer) => researchCustomerSignals(customer, apiKey)),
  );
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
    customersChecked: customers?.length ?? 0,
    customersFailed,
    signalsFound,
    signalsSaved,
  });
}
