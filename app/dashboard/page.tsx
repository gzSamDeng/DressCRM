import Link from "next/link";
import { Header } from "@/components/header";
import { SignalRefreshButton } from "@/components/signal-refresh-button";
import { buildFollowUpRecommendations, coldCadenceDays, engagedCadenceDays, type CustomerSignal } from "@/lib/follow-up-priority";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";
import "./dashboard.css";

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const [{ data: customers }, { data: followUps }, { data: signals }, { data: reviewedLeads }] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("follow_ups").select("*").order("happened_at", { ascending: false }),
    supabase.from("customer_signals").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("discovered_leads").select("review_status,reviewed_at").gte("reviewed_at", weekStart.toISOString()),
  ]);
  const recommendations = buildFollowUpRecommendations(
    (customers ?? []) as Customer[],
    (followUps ?? []) as FollowUp[],
    (signals ?? []) as CustomerSignal[],
    now,
  );
  const dueToday = recommendations.filter((item) => item.overdueDays >= 0);
  const completedThisWeek = (followUps ?? []).filter((item) => new Date(item.happened_at) >= weekStart).length;
  const repliedThisWeek = (followUps ?? []).filter((item) => new Date(item.happened_at) >= weekStart && ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"].includes(item.outcome ?? "")).length;
  const activeSignals = (signals ?? []).filter((item) => new Date(item.created_at) >= new Date(now.getTime() - 30 * 86_400_000)).length;
  const reviewedThisWeek = reviewedLeads?.length ?? 0;
  const approvedThisWeek = reviewedLeads?.filter((item) => item.review_status === "approved").length ?? 0;

  return <div className="shell"><Header/><main className="container dashboardPage">
    <div className="pageHeader"><div><span className="pageKicker">SALES WORKSPACE</span><h2>今日任务与效果看板</h2><p>先处理有回复、已逾期和出现最新商业机会的高价值客户。</p></div><SignalRefreshButton/></div>
    <section className="cards">
      {[["今天及逾期",dueToday.length],["本周审核通过",`${approvedThisWeek}/${reviewedThisWeek}`],["本周已跟进",completedThisWeek],["本周有效回复",repliedThisWeek],["近30天商业信号",activeSignals]].map(([label,value])=><div className="card metricCard" key={label}><div className="muted">{label}</div><div className="metric">{value}</div></div>)}
    </section>
    <div className="dashboardGrid">
      <section className="card priorityPanel"><div className="panelHeading"><div><h3>优先跟进客户</h3><p>综合客户等级、到期情况、回复历史和商业信号排序。</p></div><span>{dueToday.length} 项待处理</span></div>
        <div className="taskList">{recommendations.slice(0,12).map((item, index)=><article className={item.overdueDays >= 0 ? "taskItem due" : "taskItem"} key={item.customer.id}>
          <span className="taskRank">{index + 1}</span><div className="taskMain"><div><strong>{item.customer.company}</strong><span className={`badge ${item.customer.priority === "A+" ? "ap" : ""}`}>{item.customer.priority}</span>{item.hasReplied && <span className="replyBadge">曾回复</span>}</div><p>{item.reason}</p>{item.latestSignal && <a href={item.latestSignal.source_url} target="_blank" rel="noreferrer">查看机会信号：{item.latestSignal.title}</a>}</div>
          <div className="taskMeta"><strong>{item.score} 分</strong><span>{item.dueAt.toLocaleDateString("zh-CN")}</span><Link href={`/customers/${item.customer.id}`}>立即跟进</Link></div>
        </article>)}{!recommendations.length && <p className="muted">目前没有需要跟进的客户。</p>}</div>
      </section>
      <aside className="card cadencePanel"><h3>当前跟进频率</h3><p>无回复客户保持低频，客户回复后自动提高频率。</p><table><thead><tr><th>等级</th><th>未回复</th><th>曾回复</th></tr></thead><tbody>{["A+","A","B","C","D"].map((grade)=><tr key={grade}><td><strong>{grade}</strong></td><td>{coldCadenceDays[grade]} 天</td><td>{engagedCadenceDays[grade]} 天</td></tr>)}</tbody></table><small>人工设置的“下次跟进日期”始终优先于自动规则；明确拒绝、退订或联系方式无效的客户不会进入任务列表。</small></aside>
    </div>
  </main></div>;
}

