import Link from "next/link";
import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const cadence = { "A+": 10, A: 21, B: 30, C: 45, D: 90 } as Record<string, number>;

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: customers }, { data: followUps }, { data: reviewed }] = await Promise.all([
    supabase.from("customers").select("id,company,priority,next_follow_up_at,stage"),
    supabase.from("follow_ups").select("customer_id,happened_at,outcome").order("happened_at", { ascending: false }),
    supabase.from("discovered_leads").select("review_status,reviewed_at").not("reviewed_at", "is", null),
  ]);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const latest = new Map<string, string>();
  for (const item of followUps ?? []) if (!latest.has(item.customer_id)) latest.set(item.customer_id, item.happened_at);
  const tasks = (customers ?? []).map((customer) => {
    const last = latest.get(customer.id);
    const automatic = new Date(last ?? now.toISOString());
    automatic.setDate(automatic.getDate() + (last ? (cadence[customer.priority] ?? 45) : -(cadence[customer.priority] ?? 45)));
    const due = customer.next_follow_up_at ? new Date(customer.next_follow_up_at) : automatic;
    const overdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
    const weight = customer.priority === "A+" ? 50 : customer.priority === "A" ? 40 : customer.priority === "B" ? 25 : 10;
    return { customer, due, overdue, score: weight + Math.max(0, overdue) };
  }).filter((item) => item.overdue >= 0).sort((a, b) => b.score - a.score);
  const weeklyFollowUps = (followUps ?? []).filter((x) => new Date(x.happened_at) >= weekAgo).length;
  const weeklyReviewed = (reviewed ?? []).filter((x) => new Date(x.reviewed_at) >= weekAgo).length;
  const approved = (reviewed ?? []).filter((x) => new Date(x.reviewed_at) >= weekAgo && x.review_status === "approved").length;

  return <div className="shell"><Header/><main className="container">
    <div className="page-title"><div><span className="eyebrow">TODAY</span><h2>今日任务与效果看板</h2><p>按照客户等级、到期时间和历史跟进记录安排优先顺序。</p></div></div>
    <section className="cards">
      <div className="card"><div className="muted">今天及逾期</div><div className="metric">{tasks.length}</div></div>
      <div className="card"><div className="muted">本周审核通过</div><div className="metric">{approved}/{weeklyReviewed}</div></div>
      <div className="card"><div className="muted">本周已跟进</div><div className="metric">{weeklyFollowUps}</div></div>
    </section>
    <section className="card"><div className="section-heading"><div><h3>优先跟进客户</h3><p>未回复客户保持低频；客户回复后可人工设置更近的跟进日期。</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>优先级</th><th>客户</th><th>等级</th><th>到期日</th><th>状态</th><th></th></tr></thead><tbody>
        {tasks.slice(0, 30).map((item, index) => <tr key={item.customer.id}><td>{index + 1}</td><td><strong>{item.customer.company}</strong></td><td>{item.customer.priority}</td><td>{item.due.toLocaleDateString("zh-CN")}</td><td>{item.overdue > 0 ? `逾期 ${item.overdue} 天` : "今天"}</td><td><Link className="button secondary" href={`/customers/${item.customer.id}`}>查看并跟进</Link></td></tr>)}
      </tbody></table>{!tasks.length && <p className="muted">今天没有到期的跟进任务。</p>}</div>
    </section>
  </main></div>;
}
