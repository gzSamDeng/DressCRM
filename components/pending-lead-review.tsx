import Link from "next/link";
import { approveDiscoveredLead, rejectDiscoveredLead } from "@/app/actions";

type DiscoveredLead = {
  id: string;
  company: string;
  website: string | null;
  country: string | null;
  city: string | null;
  customer_type: string | null;
  ai_score: number;
  ai_grade: string;
  confidence: string | null;
  signals: string[];
  evidence: string[];
  risks: string[];
  recommendation: string | null;
  source_url: string | null;
  review_status: string;
};

export function PendingLeadReview({ leads, total, page, pageSize, status }: {
  leads: DiscoveredLead[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (nextPage: number) => `/lead-intelligence?reviewStatus=${status}&reviewPage=${nextPage}#review-center`;

  return <section className="reviewCenter" id="review-center">
    <div className="reviewHeader">
      <div><span className="eyebrow">DATABASE REVIEW QUEUE</span><h2>线索审核中心</h2><p>数据库中共 {total} 条“{status === "pending" ? "待审核" : status === "approved" ? "已批准" : "已拒绝"}”线索，每页 {pageSize} 条。</p></div>
      <nav className="reviewTabs">
        <Link className={status === "pending" ? "active" : ""} href="/lead-intelligence?reviewStatus=pending#review-center">待审核</Link>
        <Link className={status === "approved" ? "active" : ""} href="/lead-intelligence?reviewStatus=approved#review-center">已批准</Link>
        <Link className={status === "rejected" ? "active" : ""} href="/lead-intelligence?reviewStatus=rejected#review-center">已拒绝</Link>
      </nav>
    </div>
    <div className="reviewTableWrap">
      <table className="reviewTable"><thead><tr><th>评分</th><th>公司</th><th>客户类型</th><th>证据与风险</th><th>操作</th></tr></thead>
        <tbody>{leads.map((lead) => <tr key={lead.id}>
          <td><strong>{lead.ai_score}</strong><small>{lead.ai_grade}</small></td>
          <td><strong>{lead.company}</strong><small>{[lead.city, lead.country].filter(Boolean).join(" · ") || "地区待确认"}</small>{lead.website && <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>}</td>
          <td>{lead.customer_type || "待确认"}</td>
          <td><details><summary>站内查看证据</summary><div className="evidencePanel">{lead.evidence?.map((item) => <p key={item}>{item}</p>)}{lead.risks?.map((risk) => <p className="riskSignal" key={risk}>! {risk}</p>)}{lead.source_url && <a href={lead.source_url} target="_blank" rel="noreferrer">尝试打开原始网页</a>}</div></details></td>
          <td>{status === "pending" ? <div className="reviewActions"><form action={approveDiscoveredLead.bind(null, lead.id)}><button className="approveButton">批准进入 CRM</button></form><form action={rejectDiscoveredLead.bind(null, lead.id)}><button className="rejectButton">拒绝</button></form></div> : <span className="reviewedBadge">{status === "approved" ? "已批准" : "已拒绝"}</span>}</td>
        </tr>)}
        {!leads.length && <tr><td colSpan={5} className="reviewEmpty">当前没有此状态的线索。</td></tr>}</tbody>
      </table>
    </div>
    <div className="pagination"><Link aria-disabled={page <= 1} href={page <= 1 ? href(1) : href(page - 1)}>上一页</Link><span>第 {page} / {pages} 页</span><Link aria-disabled={page >= pages} href={page >= pages ? href(pages) : href(page + 1)}>下一页</Link></div>
  </section>;
}
