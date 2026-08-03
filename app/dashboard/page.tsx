import Link from "next/link";
import { Header } from "@/components/header";
import { SignalRefreshButton } from "@/components/signal-refresh-button";
import { buildFollowUpRecommendations, coldCadenceDays, engagedCadenceDays, type CustomerSignal } from "@/lib/follow-up-priority";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";
import "./dashboard.css";

export const dynamic = "force-dynamic";

type Profile = { id: string; email: string | null; display_name: string | null };
type ReviewedLead = { id: string; company: string; review_status: string; reviewed_at: string; reviewed_by: string | null };

function chinaDayStart(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - 8 * 3_600_000);
}

function MetricCard({ label, value, help }: { label: string; value: string | number; help: string }) {
  return <div className="card metricCard explainedMetric">
    <div className="metricLabel"><span className="muted">{label}</span><details className="metricHelp"><summary aria-label={`查看“${label}”计算说明`}>?</summary><p>{help}</p></details></div>
    <div className="metric">{value}</div>
  </div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ taskPage?: string }> }) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number(params.taskPage ?? 1) || 1);
  const pageSize = 20;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const now = new Date();
  const todayStart = chinaDayStart(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const chinaWeekday = new Date(todayStart.getTime() + 8 * 3_600_000).getUTCDay() || 7;
  const weekStart = new Date(todayStart.getTime() - (chinaWeekday - 1) * 86_400_000);

  const [{ data: customers }, { data: followUps }, { data: signals }, { data: reviewedLeads }, { data: profiles }] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("follow_ups").select("*").order("happened_at", { ascending: false }),
    supabase.from("customer_signals").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("discovered_leads").select("id,company,review_status,reviewed_at,reviewed_by").gte("reviewed_at", weekStart.toISOString()),
    supabase.from("user_profiles").select("id,email,display_name"),
  ]);

  const allCustomers = (customers ?? []) as Customer[];
  const allFollowUps = (followUps ?? []) as FollowUp[];
  const allReviewed = (reviewedLeads ?? []) as ReviewedLead[];
  const allProfiles = (profiles ?? []) as Profile[];
  const recommendations = buildFollowUpRecommendations(allCustomers, allFollowUps, (signals ?? []) as CustomerSignal[], now);
  const dueTasks = recommendations.filter((item) => item.overdueDays >= 0);
  const taskPages = Math.max(1, Math.ceil(recommendations.length / pageSize));
  const taskPage = Math.min(requestedPage, taskPages);
  const pageTasks = recommendations.slice((taskPage - 1) * pageSize, taskPage * pageSize);

  const isToday = (value: string) => { const time = new Date(value).getTime(); return time >= todayStart.getTime() && time < tomorrowStart.getTime(); };
  const isThisWeek = (value: string) => new Date(value).getTime() >= weekStart.getTime();
  const todayFollowUps = allFollowUps.filter((item) => isToday(item.happened_at));
  const weekFollowUps = allFollowUps.filter((item) => isThisWeek(item.happened_at));
  const todayReviewed = allReviewed.filter((item) => isToday(item.reviewed_at));
  const todayApproved = todayReviewed.filter((item) => item.review_status === "approved");
  const weekReviewed = allReviewed.filter((item) => isThisWeek(item.reviewed_at));
  const weekApproved = weekReviewed.filter((item) => item.review_status === "approved");
  const replyOutcomes = ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"];
  const weekReplies = weekFollowUps.filter((item) => replyOutcomes.includes(item.outcome ?? ""));
  const activeSignals = (signals ?? []).filter((item) => new Date(item.created_at) >= new Date(now.getTime() - 30 * 86_400_000)).length;
  const customerNames = new Map(allCustomers.map((customer) => [customer.id, customer.company]));
  const profileNames = new Map(allProfiles.map((profile) => [profile.id, profile.email || profile.display_name || `用户 ${profile.id.slice(0, 8)}`]));
  const actorName = (id: string | null) => id ? profileNames.get(id) ?? `用户 ${id.slice(0, 8)}` : auth.user?.email ?? "历史数据（未记录人员）";
  const actorIds = Array.from(new Set([...todayFollowUps.map((item) => item.created_by), ...todayReviewed.map((item) => item.reviewed_by)]));
  const dailyByUser = actorIds.map((actorId) => ({
    id: actorId ?? "unknown",
    name: actorName(actorId),
    followed: todayFollowUps.filter((item) => item.created_by === actorId).length,
    approved: todayApproved.filter((item) => item.reviewed_by === actorId).length,
    rejected: todayReviewed.filter((item) => item.reviewed_by === actorId && item.review_status === "rejected").length,
  })).sort((a, b) => (b.followed + b.approved + b.rejected) - (a.followed + a.approved + a.rejected));
  const activity = [
    ...todayFollowUps.map((item) => ({ time: item.happened_at, actor: actorName(item.created_by), action: `跟进 · ${item.channel}`, company: customerNames.get(item.customer_id) ?? "未知客户", result: item.outcome || item.summary })),
    ...todayReviewed.map((item) => ({ time: item.reviewed_at, actor: actorName(item.reviewed_by), action: item.review_status === "approved" ? "审核通过" : "审核拒绝", company: item.company, result: "AI 获客线索审核" })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return <div className="shell"><Header/><main className="container dashboardPage">
    <div className="pageHeader"><div><span className="pageKicker">SALES WORKSPACE</span><h2>今日任务与效果看板</h2><p>先处理有回复、已逾期和出现最新商业机会的高价值客户。</p></div><SignalRefreshButton/></div>
    <section className="dashboardMetrics">
      <MetricCard label="今天及逾期" value={dueTasks.length} help="下次跟进日期不晚于今天的有效客户数。人工指定日期优先；否则按客户等级、是否曾回复以及最近一次跟进日期自动计算。"/>
      <MetricCard label="今日审核通过" value={`${todayApproved.length}/${todayReviewed.length}`} help="分子是今天批准进入客户线索的 AI 线索数，分母是今天已审核的全部线索数（批准＋拒绝）。按中国时间自然日计算。"/>
      <MetricCard label="今日已跟进" value={todayFollowUps.length} help="今天保存到客户跟进记录中的记录数。每次成功保存一条跟进记录计 1 次，按中国时间自然日计算。"/>
      <MetricCard label="本周审核通过" value={`${weekApproved.length}/${weekReviewed.length}`} help="本周一零点至现在：批准数／全部已审核数。全部已审核数包含批准和拒绝。"/>
      <MetricCard label="本周已跟进" value={weekFollowUps.length} help="本周一零点至现在保存的全部客户跟进记录数。"/>
      <MetricCard label="本周有效回复" value={weekReplies.length} help="本周跟进结果为“已回复、有兴趣、要求报价、要求样品、采购计划明确”的记录数。"/>
      <MetricCard label="近30天商业信号" value={activeSignals} help="最近 30 天通过客户新闻搜索保存的商业机会信号数，例如供应链、采购、扩张、合作或新品动态。"/>
    </section>

    <div className="dashboardGrid">
      <section className="card priorityPanel"><div className="panelHeading"><div><h3>优先跟进客户</h3><p>显示全部有效客户，综合等级、到期情况、回复历史和商业信号排序；每页 {pageSize} 条。</p></div><span>{recommendations.length} 位客户</span></div>
        <div className="taskList">{pageTasks.map((item, index) => <article className={item.overdueDays >= 0 ? "taskItem due" : "taskItem"} key={item.customer.id}>
          <span className="taskRank">{(taskPage - 1) * pageSize + index + 1}</span>
          <div className="taskMain"><div><strong>{item.customer.company}</strong><span className={`badge ${item.customer.priority === "A+" ? "ap" : ""}`}>{item.customer.priority}</span>{item.hasReplied && <span className="replyBadge">曾回复</span>}</div><p>{item.reason}</p>{item.latestSignal && <a href={item.latestSignal.source_url} target="_blank" rel="noreferrer">查看机会信号：{item.latestSignal.title}</a>}</div>
          <div className="taskMeta"><strong>{item.score} 分</strong><span>应跟进：{item.dueAt.toLocaleDateString("zh-CN")}</span><Link href={`/customers/${item.customer.id}`}>查看并跟进</Link></div>
        </article>)}{!pageTasks.length && <p className="emptyState">目前没有可跟进的客户。</p>}</div>
        <div className="taskPagination"><Link aria-disabled={taskPage <= 1} href={`/dashboard?taskPage=${Math.max(1, taskPage - 1)}`}>上一页</Link><span>第 {taskPage} / {taskPages} 页 · 共 {recommendations.length} 条</span><Link aria-disabled={taskPage >= taskPages} href={`/dashboard?taskPage=${Math.min(taskPages, taskPage + 1)}`}>下一页</Link></div>
      </section>
      <aside className="card cadencePanel"><h3>当前跟进频率</h3><p>无回复客户保持低频，客户回复后自动提高频率。</p><table><thead><tr><th>等级</th><th>未回复</th><th>曾回复</th></tr></thead><tbody>{["A+","A","B","C","D"].map((grade) => <tr key={grade}><td><strong>{grade}</strong></td><td>{coldCadenceDays[grade]} 天</td><td>{engagedCadenceDays[grade]} 天</td></tr>)}</tbody></table><small>人工设置的“下次跟进日期”始终优先；明确拒绝、退订或联系方式无效的客户不会进入任务列表。</small></aside>
    </div>

    <section className="card activityPanel"><div className="panelHeading"><div><h3>今日业务员工作</h3><p>按中国时间统计今天每位业务员完成的审核与客户跟进。</p></div><span>{activity.length} 项操作</span></div>
      <div className="userSummaryGrid">{dailyByUser.map((user) => <div className="userSummary" key={user.id}><strong>{user.name}</strong><span>审核通过 {user.approved}</span><span>审核拒绝 {user.rejected}</span><span>客户跟进 {user.followed}</span></div>)}{!dailyByUser.length && <p className="muted">今天还没有审核或跟进记录。</p>}</div>
      <div className="activityTableWrap"><table className="activityTable"><thead><tr><th>时间</th><th>业务员</th><th>完成事项</th><th>客户/线索</th><th>结果</th></tr></thead><tbody>{activity.map((item, index) => <tr key={`${item.time}-${index}`}><td>{new Date(item.time).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" })}</td><td>{item.actor}</td><td>{item.action}</td><td><strong>{item.company}</strong></td><td>{item.result || "—"}</td></tr>)}{!activity.length && <tr><td colSpan={5}>今天暂无工作记录。</td></tr>}</tbody></table></div>
    </section>
  </main></div>;
}
