import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "请先登录系统。" }, { status: 401 });
  const payload = await request.json() as {
    customer_id?: string;
    destination?: string;
    call_id?: string;
    provider?: string;
    started_at?: string;
    ended_at?: string;
    status?: string;
  };
  if (!payload.customer_id || !payload.destination || !payload.started_at) {
    return NextResponse.json({ error: "通话记录参数不完整。" }, { status: 400 });
  }
  const { data } = await supabase.from("customers").select("*").eq("id", payload.customer_id).single();
  if (!data) return NextResponse.json({ error: "客户不存在。" }, { status: 404 });
  const started = new Date(payload.started_at);
  const ended = payload.ended_at ? new Date(payload.ended_at) : new Date();
  const duration = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));
  const { error } = await supabase.from("follow_ups").insert({
    customer_id: data.id,
    channel: "Phone",
    summary: `${payload.provider || "DIDWW phone.systems"}：拨打 ${payload.destination}，状态 ${payload.status || "已结束"}，操作计时 ${duration} 秒。${payload.call_id ? `\n通话 ID：${payload.call_id}` : ""}`,
    outcome: "待补充通话结果",
    next_action: "确认是否接通，并补充通话摘要和下一步",
    happened_at: started.toISOString(),
    created_by: auth.user.id,
  });
  if (error) return NextResponse.json({ error: `通话已结束，但留痕失败：${error.message}` }, { status: 500 });
  revalidatePath("/follow-up");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${data.id}`);
  return NextResponse.json({ ok: true });
}
