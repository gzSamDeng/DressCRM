import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { SignalRefreshButton } from "@/components/signal-refresh-button";
import { buildFollowUpRecommendations, coldCadenceDays, engagedCadenceDays, type CustomerSignal } from "@/lib/follow-up-priority";
import { getAppProfile, isManagementRole, roleLabels, type AppProfile } from "@/lib/access-control";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";
import "./dashboard.css";
import "./manager-dashboard.css";

export const dynamic = "force-dynamic";

type Team = { id: string; name: string };
type ReviewedLead = { id: string; company: string; review_status: string; reviewed_at: string | null; reviewed_by: string | null; created_at: string };

const replyOutcomes = ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"];

function chinaDayStart(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - 8 * 3_600_000);
}

function MetricCard({ label, value, help, tone }: { label: string; value: string | number; help: string; tone?: string }) {
  return <div className={`card metricCard explainedMetric ${tone || ""}`}>
    <div className="metricLabel"><span className="muted">{label}</span><details className="metricHelp"><summary aria-label={`查看“${label}”计算说明`}>?</summary><p>{help}</p></details></div>
    <div className="metric">{value}</div>
  </div>;
}

function percent(numerator: number, denominator: number) {
  return denominator ? `${Math.round(numerator / denominator * 100)}%` : "—";
}

function channelName(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized.includes("mail")) return "邮件";
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("phone") || normalized.includes("call")) return "电话";
  if (normalized.includes("telegram")) return "Telegram";
  if (normalized.includes("linkedin")) return "LinkedIn";
  return channel || "其他";
}

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ taskPage?: string; view?: string; period?: string; user?: string; team?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const currentProfile = await getAppProfile(auth.user.id, auth.user.email);
  if (!currentProfile.is_active) redirect("/login?error=" + encodeURIComponent("账号已停用，请联系管理员。"));

  const now = new Date();
  const todayStart = chinaDayStart(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const chinaWeekday = new Date(todayStart.getTime() + 8 * 3_600_000).getUTCDay() || 7;
  const weekStart = new Date(todayStart.getTime() - (chinaWeekday - 1) * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3_600_000);
  const period = ["today", "week", "month"].includes(params.period || "") ? params.period! : "week";
  const periodStart = period === "today" ? todayStart : period === "month" ? monthStart : weekStart;

  const [{ data: customers }, { data: followUps }, { data: signals }, { data: reviewedLeads }, { data: profiles }, { data: teams }] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("follow_ups").select("*").order("happened_at", { ascending: false }),
    supabase.from("customer_signals").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("discovered_leads").select("id,company,review_status,reviewed_at,reviewed_by,created_at").gte("created_at", monthStart.toISOString()),
    supabase.from("user_profiles").select("id,email,display_name,role,team_id,manager_id,is_active,permissions"),
    supabase.from("sales_teams").select("id,name").order("name"),
  ]);

  const allCustomers = (customers ?? []) as Customer[];
  const allFollowUps = (followUps ?? []) as FollowUp[];
  const allSignals = (signals ?? []) as CustomerSignal[];
  const allReviewed = (reviewedLeads ?? []) as ReviewedLead[];
  const visibleProfiles = (profiles ?? []) as AppProfile[];
  const visibleTeams = (teams ?? []) as Team[];
  const management = isManagementRole(currentProfile.role) && params.view !== "personal";

  if (!management) {
    return <PersonalDashboard
      currentProfile={currentProfile}
      customers={allCustomers.filter((customer) => customer.owner_id === currentProfile.id)}
      followUps={allFollowUps.filter((item) => item.created_by === currentProfile.id)}
      signals={allSignals}
      reviewed={allReviewed.filter((item) => item.reviewed_by === currentProfile.id)}
      now={now}
      todayStart={todayStart}
      tomorrowStart={tomorrowStart}
      weekStart={weekStart}
      requestedPage={Math.max(1, Number(params.taskPage ?? 1) || 1)}
      canSwitch={isManagementRole(currentProfile.role)}
    />;
  }

  const selectedTeam = currentProfile.role === "owner" && params.team ? params.team : null;
  const teamProfiles = visibleProfiles.filter((profile) => profile.is_active && (!selectedTeam || profile.team_id === selectedTeam));
  const allowedIds = new Set(teamProfiles.map((profile) => profile.id));
  const selectedUser = params.user && allowedIds.has(params.user) ? params.user : null;
  const scopedIds = selectedUser ? new Set([selectedUser]) : allowedIds;
  const scopedCustomers = allCustomers.filter((customer) => selectedUser
    ? customer.owner_id === selectedUser
    : selectedTeam ? Boolean(customer.owner_id && scopedIds.has(customer.owner_id)) : true);
  const customerIds = new Set(scopedCustomers.map((customer) => customer.id));
  const scopedFollowUps = allFollowUps.filter((item) => customerIds.has(item.customer_id) && (!selectedUser || item.created_by === selectedUser));
  const scopedReviewed = allReviewed.filter((item) => item.reviewed_by
    ? scopedIds.has(item.reviewed_by)
    : currentProfile.role === "owner" && !selectedTeam && !selectedUser);
  const scopedSignals = allSignals.filter((item) => customerIds.has(item.customer_id));
  const inPeriod = (value?: string | null) => Boolean(value && new Date(value).getTime() >= periodStart.getTime());
  const periodFollowUps = scopedFollowUps.filter((item) => inPeriod(item.happened_at));
  const periodReviewed = scopedReviewed.filter((item) => inPeriod(item.reviewed_at));
  const periodApproved = periodReviewed.filter((item) => item.review_status === "approved");
  const periodReplies = periodFollowUps.filter((item) => replyOutcomes.includes(item.outcome ?? ""));
  const contactedIds = new Set(periodFollowUps.map((item) => item.customer_id));
  const repliedIds = new Set(periodReplies.map((item) => item.customer_id));
  const firstFollowUp = new Map<string, string>();
  scopedFollowUps.forEach((item) => {
    const current = firstFollowUp.get(item.customer_id);
    if (!current || new Date(item.happened_at) < new Date(current)) firstFollowUp.set(item.customer_id, item.happened_at);
  });
  const firstContactCount = Array.from(firstFollowUp.values()).filter(inPeriod).length;
  const overdueCustomers = scopedCustomers.filter((customer) => customer.next_follow_up_at && new Date(customer.next_follow_up_at) <= now);
  const unassignedCustomers = scopedCustomers.filter((customer) => !customer.owner_id);
  const noFirstContact = scopedCustomers.filter((customer) => !firstFollowUp.has(customer.id) && new Date(customer.created_at).getTime() < now.getTime() - 2 * 86_400_000);
  const highPriorityOverdue = overdueCustomers.filter((customer) => customer.priority === "A+" || customer.priority === "A");
  const qualifiedCustomers = scopedCustomers.filter((customer) => [
    "Qualified", "Replied", "Meeting Scheduled", "Quotation", "Sampling", "Order", "Repeat Order",
    "Engaged", "Interested", "Quoted", "Sample", "Negotiation",
  ].includes(customer.stage)).length;
  const profileMap = new Map(visibleProfiles.map((profile) => [profile.id, profile]));
  const teamMap = new Map(visibleTeams.map((team) => [team.id, team.name]));
  const actorName = (id: string | null) => id ? profileMap.get(id)?.display_name || profileMap.get(id)?.email || `用户 ${id.slice(0, 8)}` : "历史数据";

  const teamRows = teamProfiles.map((profile) => {
    const owned = allCustomers.filter((customer) => customer.owner_id === profile.id);
    const ownedIds = new Set(owned.map((customer) => customer.id));
    const activity = allFollowUps.filter((item) => item.created_by === profile.id && inPeriod(item.happened_at));
    const followed = new Set(activity.map((item) => item.customer_id));
    const replies = new Set(activity.filter((item) => replyOutcomes.includes(item.outcome ?? "")).map((item) => item.customer_id));
    return {
      profile,
      owned: owned.length,
      approved: allReviewed.filter((item) => item.reviewed_by === profile.id && item.review_status === "approved" && inPeriod(item.reviewed_at)).length,
      followed: followed.size,
      actions: activity.length,
      replies: replies.size,
      overdue: owned.filter((customer) => customer.next_follow_up_at && new Date(customer.next_follow_up_at) <= now).length,
      untouched: owned.filter((customer) => !allFollowUps.some((item) => item.customer_id === customer.id)).length,
      replyRate: percent(replies.size, followed.size),
      activeCustomerCount: ownedIds.size,
    };
  }).sort((a, b) => b.replies - a.replies || b.followed - a.followed);

  const channels = Array.from(new Set(periodFollowUps.map((item) => channelName(item.channel)))).map((name) => {
    const items = periodFollowUps.filter((item) => channelName(item.channel) === name);
    const customerCount = new Set(items.map((item) => item.customer_id)).size;
    const replyCount = new Set(items.filter((item) => replyOutcomes.includes(item.outcome ?? "")).map((item) => item.customer_id)).size;
    return { name, actions: items.length, customers: customerCount, replies: replyCount, rate: percent(replyCount, customerCount) };
  }).sort((a, b) => b.actions - a.actions);

  const activity = [
    ...periodFollowUps.map((item) => ({ time: item.happened_at, actor: actorName(item.created_by), action: `跟进 · ${channelName(item.channel)}`, company: allCustomers.find((customer) => customer.id === item.customer_id)?.company || "未知客户", result: item.outcome || item.summary })),
    ...periodReviewed.filter((item) => item.reviewed_at).map((item) => ({ time: item.reviewed_at!, actor: actorName(item.reviewed_by), action: item.review_status === "approved" ? "审核通过" : "审核拒绝", company: item.company, result: "AI获客线索审核" })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 80);

  const periodLabel = period === "today" ? "今天" : period === "month" ? "本月" : "本周";
  const queryBase = new URLSearchParams();
  queryBase.set("period", period);
  if (selectedTeam) queryBase.set("team", selectedTeam);

  return <div className="shell"><Header/><main className="container dashboardPage managerDashboard">
    <div className="pageHeader managerHeader"><div><span className="pageKicker">MANAGEMENT WORKSPACE</span><h2>{currentProfile.role === "owner" ? "全公司经营看板" : "团队经营看板"}</h2><p>{roleLabels[currentProfile.role]}视图 · 关注团队执行、渠道效果、客户转化与异常任务。</p></div><div className="dashboardHeaderActions"><Link className="secondaryButton" href="/dashboard?view=personal">切换到我的工作台</Link><SignalRefreshButton/></div></div>

    <form className="card dashboardFilters" method="get">
      <label>统计周期<select name="period" defaultValue={period}><option value="today">今天</option><option value="week">本周</option><option value="month">本月</option></select></label>
      {currentProfile.role === "owner" && <label>团队<select name="team" defaultValue={selectedTeam || ""}><option value="">全公司</option>{visibleTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
      <label>业务员<select name="user" defaultValue={selectedUser || ""}><option value="">全部人员</option>{teamProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name || profile.email} · {roleLabels[profile.role]}</option>)}</select></label>
      <button className="primary" type="submit">应用筛选</button>
      <span className="filterScope">当前范围：{selectedUser ? actorName(selectedUser) : selectedTeam ? teamMap.get(selectedTeam) : currentProfile.role === "owner" ? "全公司" : teamMap.get(currentProfile.team_id || "") || "我的团队"}</span>
    </form>

    <section className="dashboardMetrics managerMetrics">
      <MetricCard label={`${periodLabel}审核通过`} value={`${periodApproved.length}/${periodReviewed.length}`} help="分子为批准进入客户线索的数量，分母为批准和拒绝的全部已审核线索。"/>
      <MetricCard label={`${periodLabel}首次联系`} value={firstContactCount} help="所选周期内第一次产生跟进记录的客户数，同一客户只计算一次。"/>
      <MetricCard label={`${periodLabel}跟进客户`} value={contactedIds.size} help={`覆盖 ${contactedIds.size} 家客户，共保存 ${periodFollowUps.length} 条跟进记录，避免只用操作次数评价业务员。`}/>
      <MetricCard label={`${periodLabel}有效回复`} value={repliedIds.size} help="跟进结果为已回复、有兴趣、要求报价、要求样品或采购计划明确的去重客户数。" tone="successMetric"/>
      <MetricCard label="当前意向客户" value={qualifiedCustomers} help="当前阶段已经进入回复、报价、样品或洽谈状态的客户数。"/>
      <MetricCard label="A/A+逾期" value={highPriorityOverdue.length} help="A+或A级客户的下次跟进日期已经到期，但尚未完成下一次跟进。" tone={highPriorityOverdue.length ? "warningMetric" : ""}/>
      <MetricCard label="未首次联系" value={noFirstContact.length} help="进入客户线索超过2天，但系统中仍没有任何跟进记录的客户。"/>
      <MetricCard label="未分配客户" value={unassignedCustomers.length} help="尚未设置负责业务员的客户，只对总监和老板显示。"/>
    </section>

    <div className="managementGrid">
      <section className="card funnelPanel"><div className="panelHeading"><div><h3>客户开发漏斗</h3><p>点击相关数字可以继续查看明细，重点发现从审核到回复之间的停滞环节。</p></div><span>{periodLabel}</span></div>
        <div className="funnelSteps">
          {[
            ["发现线索", scopedReviewed.filter((item) => inPeriod(item.created_at)).length],
            ["审核通过", periodApproved.length],
            ["首次联系", firstContactCount],
            ["已跟进客户", contactedIds.size],
            ["有效回复", repliedIds.size],
            ["当前意向", qualifiedCustomers],
          ].map(([label, value], index) => <div key={String(label)} className="funnelStep"><span>{index + 1}</span><div><small>{label}</small><strong>{value}</strong></div>{index < 5 && <b>→</b>}</div>)}
        </div>
      </section>

      <aside className="card alertPanel"><div className="panelHeading"><div><h3>需要管理者关注</h3><p>优先解决高价值客户和无人负责的任务。</p></div></div>
        <div className="alertList">
          <Link href="/?priority=A+"><strong>{highPriorityOverdue.length}</strong><span>A/A+客户逾期未跟进</span></Link>
          <Link href="/"><strong>{noFirstContact.length}</strong><span>客户进入系统后尚未首次联系</span></Link>
          <Link href="/"><strong>{unassignedCustomers.length}</strong><span>客户尚未分配业务员</span></Link>
          <Link href="/lead-intelligence?reviewStatus=pending#review-center"><strong>{scopedReviewed.filter((item) => item.review_status === "pending").length}</strong><span>待审核AI线索</span></Link>
        </div>
      </aside>
    </div>

    <section className="card teamPerformance"><div className="panelHeading"><div><h3>业务员执行与结果</h3><p>同时查看工作覆盖、有效回复和逾期情况，不以单纯操作次数排名。</p></div><span>{teamRows.length} 位人员</span></div>
      <div className="activityTableWrap"><table className="activityTable performanceTable"><thead><tr><th>业务员</th><th>角色/团队</th><th>负责客户</th><th>审核通过</th><th>跟进客户</th><th>跟进记录</th><th>有效回复</th><th>回复率</th><th>逾期</th><th>从未联系</th><th>查看</th></tr></thead><tbody>
        {teamRows.map((row) => <tr key={row.profile.id}><td><strong>{row.profile.display_name || row.profile.email}</strong><small>{row.profile.email}</small></td><td>{roleLabels[row.profile.role]}<small>{row.profile.team_id ? teamMap.get(row.profile.team_id) : "未分组"}</small></td><td>{row.owned}</td><td>{row.approved}</td><td>{row.followed}</td><td>{row.actions}</td><td>{row.replies}</td><td>{row.replyRate}</td><td className={row.overdue ? "dangerCell" : ""}>{row.overdue}</td><td>{row.untouched}</td><td><Link href={`/dashboard?${queryBase.toString()}&user=${row.profile.id}`}>查看明细</Link></td></tr>)}
        {!teamRows.length && <tr><td colSpan={11}>当前范围还没有业务员。</td></tr>}
      </tbody></table></div>
    </section>

    <div className="managementGrid lowerGrid">
      <section className="card channelPanel"><div className="panelHeading"><div><h3>不同渠道跟进效果</h3><p>按照客户去重计算回复率。</p></div><span>{periodFollowUps.length} 条记录</span></div>
        <div className="channelCards">{channels.map((channel) => <div key={channel.name}><strong>{channel.name}</strong><span>覆盖 {channel.customers} 家</span><span>跟进 {channel.actions} 次</span><span>有效回复 {channel.replies}</span><b>{channel.rate}</b></div>)}{!channels.length && <p className="muted">所选周期还没有跟进记录。</p>}</div>
      </section>
      <section className="card signalSummary"><div className="panelHeading"><div><h3>客户商业信号</h3><p>当前数据范围内最近30天的外部机会信息。</p></div><span>{scopedSignals.filter((signal) => new Date(signal.created_at) >= new Date(now.getTime() - 30 * 86_400_000)).length} 条</span></div>
        <p className="signalHint">商业信号只用于调整优先级，最终仍应由业务员核实客户背景和真实采购计划。</p>
      </section>
    </div>

    <section className="card activityPanel"><div className="panelHeading"><div><h3>{periodLabel}工作明细</h3><p>记录每次审核和客户跟进的人员、时间、渠道与结果。</p></div><span>{activity.length} 项操作</span></div>
      <div className="activityTableWrap"><table className="activityTable"><thead><tr><th>时间</th><th>业务员</th><th>完成事项</th><th>客户/线索</th><th>结果</th></tr></thead><tbody>{activity.map((item, index) => <tr key={`${item.time}-${index}`}><td>{new Date(item.time).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td><td>{item.actor}</td><td>{item.action}</td><td><strong>{item.company}</strong></td><td>{item.result || "—"}</td></tr>)}{!activity.length && <tr><td colSpan={5}>所选周期暂无工作记录。</td></tr>}</tbody></table></div>
    </section>
  </main></div>;
}

function PersonalDashboard({ currentProfile, customers, followUps, signals, reviewed, now, todayStart, tomorrowStart, weekStart, requestedPage, canSwitch }: {
  currentProfile: AppProfile; customers: Customer[]; followUps: FollowUp[]; signals: CustomerSignal[]; reviewed: ReviewedLead[]; now: Date; todayStart: Date; tomorrowStart: Date; weekStart: Date; requestedPage: number; canSwitch: boolean;
}) {
  const pageSize = 20;
  const customerIds = new Set(customers.map((customer) => customer.id));
  const scopedSignals = signals.filter((signal) => customerIds.has(signal.customer_id));
  const recommendations = buildFollowUpRecommendations(customers, followUps, scopedSignals, now);
  const dueTasks = recommendations.filter((item) => item.overdueDays >= 0);
  const taskPages = Math.max(1, Math.ceil(recommendations.length / pageSize));
  const taskPage = Math.min(requestedPage, taskPages);
  const pageTasks = recommendations.slice((taskPage - 1) * pageSize, taskPage * pageSize);
  const isToday = (value: string) => { const time = new Date(value).getTime(); return time >= todayStart.getTime() && time < tomorrowStart.getTime(); };
  const isThisWeek = (value: string) => new Date(value).getTime() >= weekStart.getTime();
  const todayFollowUps = followUps.filter((item) => isToday(item.happened_at));
  const weekFollowUps = followUps.filter((item) => isThisWeek(item.happened_at));
  const todayReviewed = reviewed.filter((item) => item.reviewed_at && isToday(item.reviewed_at));
  const weekReviewed = reviewed.filter((item) => item.reviewed_at && isThisWeek(item.reviewed_at));
  const weekReplies = new Set(weekFollowUps.filter((item) => replyOutcomes.includes(item.outcome ?? "")).map((item) => item.customer_id));
  const activeSignals = scopedSignals.filter((item) => new Date(item.created_at) >= new Date(now.getTime() - 30 * 86_400_000)).length;

  return <div className="shell"><Header/><main className="container dashboardPage">
    <div className="pageHeader"><div><span className="pageKicker">MY SALES WORKSPACE</span><h2>我的今日任务与效果</h2><p>{currentProfile.display_name || currentProfile.email} · 这里只显示分配给我的客户和本人工作记录。</p></div><div className="dashboardHeaderActions">{canSwitch && <Link className="secondaryButton" href="/dashboard">返回团队经营看板</Link>}<SignalRefreshButton/></div></div>
    <section className="dashboardMetrics">
      <MetricCard label="今天及逾期" value={dueTasks.length} help="分配给我的客户中，下次跟进日期不晚于今天的有效客户数。"/>
      <MetricCard label="今日审核通过" value={`${todayReviewed.filter((item) => item.review_status === "approved").length}/${todayReviewed.length}`} help="今天由我批准的AI线索数／今天由我完成的全部审核数。"/>
      <MetricCard label="今日已跟进" value={todayFollowUps.length} help="今天由我保存的全部渠道跟进记录数。"/>
      <MetricCard label="本周审核通过" value={`${weekReviewed.filter((item) => item.review_status === "approved").length}/${weekReviewed.length}`} help="本周由我批准的AI线索数／本周由我完成的全部审核数。"/>
      <MetricCard label="本周跟进客户" value={new Set(weekFollowUps.map((item) => item.customer_id)).size} help={`本周共覆盖 ${new Set(weekFollowUps.map((item) => item.customer_id)).size} 家客户，保存 ${weekFollowUps.length} 条跟进记录。`}/>
      <MetricCard label="本周有效回复" value={weekReplies.size} help="本周产生有效回复的去重客户数。"/>
      <MetricCard label="近30天商业信号" value={activeSignals} help="分配给我的客户中，最近30天发现的商业机会信号。"/>
    </section>
    <div className="dashboardGrid">
      <section className="card priorityPanel"><div className="panelHeading"><div><h3>我的优先跟进客户</h3><p>综合客户等级、逾期情况、回复历史和商业信号排序；每页 {pageSize} 条。</p></div><span>{recommendations.length} 位客户</span></div>
        <div className="taskList">{pageTasks.map((item, index) => <article className={item.overdueDays >= 0 ? "taskItem due" : "taskItem"} key={item.customer.id}><span className="taskRank">{(taskPage - 1) * pageSize + index + 1}</span><div className="taskMain"><div><strong>{item.customer.company}</strong><span className={`badge ${item.customer.priority === "A+" ? "ap" : ""}`}>{item.customer.priority}</span>{item.hasReplied && <span className="replyBadge">曾回复</span>}</div><p>{item.reason}</p>{item.latestSignal && <a href={item.latestSignal.source_url} target="_blank" rel="noreferrer">查看机会信号：{item.latestSignal.title}</a>}</div><div className="taskMeta"><strong>{item.score} 分</strong><span>应跟进：{item.dueAt.toLocaleDateString("zh-CN")}</span><Link href={`/customers/${item.customer.id}`}>查看并跟进</Link></div></article>)}{!pageTasks.length && <p className="emptyState">目前没有分配给你的可跟进客户。</p>}</div>
        <div className="taskPagination"><Link aria-disabled={taskPage <= 1} href={`/dashboard?view=personal&taskPage=${Math.max(1, taskPage - 1)}`}>上一页</Link><span>第 {taskPage} / {taskPages} 页 · 共 {recommendations.length} 条</span><Link aria-disabled={taskPage >= taskPages} href={`/dashboard?view=personal&taskPage=${Math.min(taskPages, taskPage + 1)}`}>下一页</Link></div>
      </section>
      <aside className="card cadencePanel"><h3>当前跟进频率</h3><p>无回复客户保持低频，客户回复后自动提高频率。</p><table><thead><tr><th>等级</th><th>未回复</th><th>曾回复</th></tr></thead><tbody>{["A+","A","B","C","D"].map((grade) => <tr key={grade}><td><strong>{grade}</strong></td><td>{coldCadenceDays[grade]} 天</td><td>{engagedCadenceDays[grade]} 天</td></tr>)}</tbody></table><small>人工设置的下次跟进日期始终优先；明确拒绝、退订或联系方式无效的客户不会进入任务列表。</small></aside>
    </div>
  </main></div>;
}
