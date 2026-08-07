import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { coldCadenceDays } from "@/lib/follow-up-priority";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
  const payload = await request.json() as {
    customer_id?: string;
    destination?: string;
    call_id?: string;
    started_at?: string;
    ended_at?: string;
    status?: string;
  };
  if (!payload.customer_id || !payload.destination || !payload.started_at) {
    return NextResponse.json({ error: "通话记录参数不完整。" }, { status: 400 });
  }
  const { data } = await supabase.from("customers").select("*").eq("id", payload.customer_id).single();
  if (!data) return NextResponse.json({ error: "客户不存在。" }, { status: 404 });
  const customer = data as Customer;
  const started = new Date(payload.started_at);
  const ended = payload.ended_at ? new Date(payload.ended_at) : new Date();
  const duration = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));
  const { error } = await supabase.from("follow_ups").insert({
    customer_id: customer.id,
    channel: "Phone",
    summary: `网页电话：拨打 ${payload.destination}，状态 ${payload.status || "已结束"}，通话 ${duration} 秒。${payload.call_id ? `\nTelnyx Call ID：${payload.call_id}` : ""}`,
    outcome: duration >= 20 ? "已接通" : "无回复",
    next_action: "补充通话摘要并安排下一步",
    happened_at: started.toISOString(),
    created_by: auth.user.id,
  });
  if (error) return NextResponse.json({ error: `通话已结束，但留痕失败：${error.message}` }, { status: 500 });
  const cadenceDays = coldCadenceDays[customer.priority] ?? 30;
  await supabase.from("customers").update({
    next_follow_up_at: new Date(Date.now() + cadenceDays * 86_400_000).toISOString(),
    stage: customer.stage === "New Lead" ? "Contacted" : customer.stage,
  }).eq("id", customer.id);
  revalidatePath("/follow-up");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${customer.id}`);
  return NextResponse.json({ ok: true });
}
