import { Header } from "@/components/header";
import { LeadIntelligenceWorkbench } from "@/components/lead-intelligence-workbench";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { approveDiscoveredLead, rejectDiscoveredLead } from "@/app/actions";
import "./lead-intelligence.css";

type DiscoveredLead = {
  id: string; company: string; website: string | null; country: string | null; city: string | null;
  customer_type: string | null; ai_score: number; ai_grade: string; evidence: string[];
  risks: string[]; source_url: string | null;
};

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
    .order("ai_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(error.message);

  const leads = (data ?? []) as DiscoveredLead[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (nextPage: number) => `/lead-intelligence?reviewStatus=${status}&reviewPage=${nextPage}#review-center`;

  return <div className="shell intelligenceShell"><Header /><main className="intelligenceContainer">
    <LeadIntelligenceWorkbench />
    <section className="reviewCenter" id="review-center">
      <div className="reviewHeader"><div><span className="eyebrow">DATABASE REVIEW QUEUE</span><h2>线索审核中心</h2><p>数据库中共 {total} 条“{status === "pending" ? "待审核" : status === "approved" ? "已批准" : "已拒绝"}”线索，每页 {pageSize} 条。</p></div>
        <nav className="reviewTabs"><Link className={status === "pending" ? "active" : ""} href="/lead-intelligence?reviewStatus=pending#review-center">待审核</Link><Link className={status === "approved" ? "active" : ""} href="/lead-intelligence?reviewStatus=approved#review-center">已批准</Link><Link className={status === "rejected" ? "active" : ""} href="/lead-intelligence?reviewStatus=rejected#review-center">已拒绝</Link></nav>
      </div>
      <div className="reviewTableWrap"><table className="reviewTable"><thead><tr><th>评分</th><th>公司</th><th>客户类型</th><th>证据与风险</th><th>操作</th></tr></thead><tbody>
        {leads.map((lead) => <tr key={lead.id}><td><strong>{lead.ai_score}</strong><small>{lead.ai_grade}</small></td><td><strong>{lead.company}</strong><small>{[lead.city, lead.country].filter(Boolean).join(" · ") || "地区待确认"}</small>{lead.website && <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>}</td><td>{lead.customer_type || "待确认"}</td><td><details><summary>站内查看证据</summary><div className="evidencePanel">{lead.evidence?.map((item) => <p key={item}>{item}</p>)}{lead.risks?.map((risk) => <p className="riskSignal" key={risk}>! {risk}</p>)}{lead.source_url && <a href={lead.source_url} target="_blank" rel="noreferrer">尝试打开原始网页</a>}</div></details></td><td>{status === "pending" ? <div className="reviewActions"><form action={approveDiscoveredLead.bind(null, lead.id)}><button className="approveButton">批准进入 CRM</button></form><form action={rejectDiscoveredLead.bind(null, lead.id)}><button className="rejectButton">拒绝</button></form></div> : <span>{status === "approved" ? "已批准" : "已拒绝"}</span>}</td></tr>)}
        {!leads.length && <tr><td colSpan={5}>当前没有此状态的线索。</td></tr>}
      </tbody></table></div>
      <div className="reviewPagination"><Link aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1))}>上一页</Link><span>第 {page} / {pages} 页</span><Link aria-disabled={page >= pages} href={pageHref(Math.min(pages, page + 1))}>下一页</Link></div>
    </section>
    <style>{`.reviewCenter{margin-top:28px;background:#fffdf8;border:1px solid #ded9cf;border-radius:18px;padding:22px}.reviewHeader{display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.reviewHeader h2{font:30px Georgia,serif;margin:6px 0}.reviewHeader p{color:#68736e;margin:0}.reviewTabs{display:flex;gap:6px}.reviewTabs a{padding:8px 12px;border:1px solid #d6d0c7;border-radius:999px;font-size:12px}.reviewTabs a.active{background:#17382c;color:#fff}.reviewTableWrap{overflow:auto;margin-top:18px}.reviewTable{width:100%;border-collapse:collapse;min-width:900px}.reviewTable th,.reviewTable td{text-align:left;padding:14px 12px;border-bottom:1px solid #e5e0d7;vertical-align:top}.reviewTable td>strong,.reviewTable td>small,.reviewTable td>a{display:block}.reviewTable td small{color:#7a827d}.reviewTable td>a{font-size:11px;color:#176b55;max-width:260px;overflow:hidden;text-overflow:ellipsis}.reviewTable summary{cursor:pointer;font-weight:700;color:#245947}.evidencePanel{max-width:470px;padding:10px 0;font-size:12px}.reviewActions{display:flex;gap:6px}.reviewActions button{border:0;border-radius:8px;padding:8px 10px;cursor:pointer}.approveButton{background:#17382c;color:#fff}.rejectButton{background:#f5e8e3;color:#993d2e}.reviewPagination{display:flex;justify-content:center;gap:12px;align-items:center;padding-top:18px}.reviewPagination a{border:1px solid #ccd4d1;border-radius:8px;padding:7px 12px}.reviewPagination a[aria-disabled=true]{opacity:.4;pointer-events:none}@media(max-width:800px){.reviewHeader{display:block}.reviewTabs{margin-top:14px;overflow:auto}}`}</style>
  </main></div>;
}
