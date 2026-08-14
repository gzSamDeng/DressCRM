import { Header } from "@/components/header";
import { LeadIntelligenceWorkbench } from "@/components/lead-intelligence-workbench";
import { BuyerDemandMonitor } from "@/components/buyer-demand-monitor";
import { ReviewLeadActions } from "@/components/review-lead-actions";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { restoreExcludedCustomer } from "@/app/actions";
import { formatEvidenceList } from "@/lib/lead-intelligence/evidence";
import "./lead-intelligence.css";

type CustomsRecord = {
  id: string; import_date: string; supplier_name: string | null; hs_code: string | null;
  product_description: string | null; quantity_raw: string | null; amount_raw: string | null;
  weight_raw: string | null;
};

type DiscoveredLead = {
  id: string; customer_id: string | null; company: string; website: string | null; country: string | null; city: string | null;
  customer_type: string | null; ai_score: number; ai_grade: string; evidence: unknown; risks: string[];
  source_url: string | null; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; whatsapp: string | null; instagram: string | null;
  facebook: string | null; linkedin: string | null; exhibitor_source: string | null;
  data_completeness: number; lead_source: string; customs_import_count: number;
  first_customs_import_at: string | null; latest_customs_import_at: string | null;
  customs_source_label: string | null; customs_import_records: CustomsRecord[];
};

type ExcludedCustomer = {
  id: string; company: string; website: string | null; country: string | null;
  contact_email: string | null; exclusion_reason: string | null; excluded_at: string | null;
};

export default async function LeadIntelligencePage({ searchParams }: {
  searchParams: Promise<{ reviewPage?: string; reviewStatus?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.reviewPage ?? 1) || 1);
  const status = ["pending", "approved", "rejected"].includes(params.reviewStatus ?? "") ? params.reviewStatus! : "pending";
  const pageSize = 20;
  const supabase = await createClient();
  const [{ data, count, error }, { data: excludedData, count: excludedCount, error: excludedError }] = await Promise.all([
    supabase.from("discovered_leads")
      .select("*,customs_import_records(id,import_date,supplier_name,hs_code,product_description,quantity_raw,amount_raw,weight_raw)", { count: "exact" })
      .eq("review_status", status).order("ai_score", { ascending: false }).order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    status === "rejected"
      ? supabase.from("customers").select("id,company,website,country,contact_email,exclusion_reason,excluded_at", { count: "exact" })
        .eq("is_excluded", true).order("excluded_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (excludedError) throw new Error(excludedError.message);
  const leads = (data ?? []) as DiscoveredLead[];
  const excludedCustomers = (excludedData ?? []) as ExcludedCustomer[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (nextPage: number) => `/lead-intelligence?reviewStatus=${status}&reviewPage=${nextPage}#review-center`;

  return <div className="shell intelligenceShell"><Header /><main className="intelligenceContainer">
    <LeadIntelligenceWorkbench />
    <BuyerDemandMonitor />
    <section className="reviewCenter" id="review-center">
      <div className="reviewHeader"><div><span className="eyebrow">DATABASE REVIEW QUEUE</span><h2>线索审核中心</h2><p>数据库中共 {total} 条“{status === "pending" ? "待审核" : status === "approved" ? "已批准" : "已拒绝"}”线索，每页 {pageSize} 条。{status === "rejected" && `另有 ${excludedCount ?? excludedCustomers.length} 条从 CRM 移出的不合适客户。`}</p></div>
        <nav className="reviewTabs"><Link className={status === "pending" ? "active" : ""} href="/lead-intelligence?reviewStatus=pending#review-center">待审核</Link><Link className={status === "approved" ? "active" : ""} href="/lead-intelligence?reviewStatus=approved#review-center">已批准</Link><Link className={status === "rejected" ? "active" : ""} href="/lead-intelligence?reviewStatus=rejected#review-center">已拒绝</Link></nav>
      </div>
      {status === "rejected" && <div className="excludedCustomerPanel">
        <div><strong>从客户线索移出的不合适客户</strong><span>最近 {excludedCustomers.length} / {excludedCount ?? excludedCustomers.length} 条</span></div>
        <div className="excludedCustomerList">{excludedCustomers.map((customer) => <article key={customer.id}>
          <div><strong>{customer.company}</strong><small>{customer.country || "地区待确认"}{customer.excluded_at ? ` · ${new Date(customer.excluded_at).toLocaleDateString("zh-CN")}` : ""}</small></div>
          <p>{customer.exclusion_reason || "人工确认不属于目标客户"}</p>
          <div className="excludedActions">
            {customer.website ? <a href={customer.website.match(/^https?:\/\//i) ? customer.website : `https://${customer.website}`} target="_blank" rel="noreferrer">查看网站</a> : <span>{customer.contact_email || "无公开联系方式"}</span>}
            <form action={restoreExcludedCustomer.bind(null, customer.id)}><button className="restoreButton" type="submit">恢复到客户线索</button></form>
          </div>
        </article>)}{!excludedCustomers.length && <p>目前没有从客户线索移出的记录。</p>}</div>
      </div>}
      <div className="reviewTableWrap"><table className="reviewTable"><thead><tr><th>评分</th><th>公司</th><th>客户类型</th><th>公开联系方式</th><th>证据与风险</th><th>操作</th></tr></thead><tbody>
        {leads.map((lead) => {
          const customsRecords = [...(lead.customs_import_records ?? [])].sort((a, b) => b.import_date.localeCompare(a.import_date));
          return <tr key={lead.id}>
            <td><strong>{lead.ai_score}</strong><small>{lead.ai_grade}</small>{lead.data_completeness > 0 && <small>资料 {lead.data_completeness}%</small>}</td>
              <td><strong>{lead.company}</strong><small>{[lead.city, lead.country].filter(Boolean).join(" · ") || "地区待确认"}</small>{lead.customs_import_count > 0 && <span className="customsBadge">海关进口数据</span>}{lead.lead_source === "buyer_demand" && <span className="demandBadge">明确采购需求</span>}{lead.customs_import_count > 0 && <small>{lead.customs_import_count} 次进口 · 最近 {lead.latest_customs_import_at}</small>}{lead.exhibitor_source && lead.lead_source !== "customs_import" && <small>{lead.exhibitor_source}</small>}{lead.website && <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>}</td>
            <td>{lead.customer_type || "待确认"}</td>
            <td><div className="contactStack">{lead.contact_name && <span>{lead.contact_name}</span>}{lead.contact_email && <a href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a>}{lead.contact_phone && <span>{lead.contact_phone}</span>}{lead.whatsapp && <span>WhatsApp: {lead.whatsapp}</span>}{lead.instagram && <a href={lead.instagram} target="_blank" rel="noreferrer">Instagram</a>}{lead.facebook && <a href={lead.facebook} target="_blank" rel="noreferrer">Facebook</a>}{lead.linkedin && <a href={lead.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}{!lead.contact_email && !lead.contact_phone && !lead.whatsapp && !lead.instagram && <small>尚未找到直接联系方式</small>}</div></td>
            <td><details><summary>站内查看证据</summary><div className="evidencePanel">{formatEvidenceList(lead.evidence).map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}{lead.risks?.map((risk) => <p className="riskSignal" key={risk}>! {risk}</p>)}{lead.source_url && <a href={lead.source_url} target="_blank" rel="noreferrer">打开原始网页</a>}</div></details>{customsRecords.length > 0 && <details className="customsDetails"><summary>查看 {customsRecords.length} 条进口时间记录</summary><div>{customsRecords.map((record) => <article key={record.id}><strong>{record.import_date}</strong><span>HS {record.hs_code || "—"} · {record.quantity_raw || record.weight_raw || "数量未公开"}</span><p>{record.product_description || "礼服进口记录"}</p>{record.supplier_name && <small>中国供应商：{record.supplier_name}</small>}</article>)}</div></details>}</td>
            <td><ReviewLeadActions leadId={lead.id} status={status as "pending" | "approved" | "rejected"} linkedCustomer={Boolean(lead.customer_id)} /></td>
          </tr>;
        })}
        {!leads.length && <tr><td colSpan={6}>当前没有此状态的线索。</td></tr>}
      </tbody></table></div>
      <div className="reviewPagination"><Link aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1))}>上一页</Link><span>第 {page} / {pages} 页</span><Link aria-disabled={page >= pages} href={pageHref(Math.min(pages, page + 1))}>下一页</Link></div>
    </section>
    <style>{`.reviewCenter{margin-top:28px;background:#fffdf8;border:1px solid #ded9cf;border-radius:18px;padding:22px}.reviewHeader{display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.reviewHeader h2{font:30px Georgia,serif;margin:6px 0}.reviewHeader p{color:#68736e;margin:0}.reviewTabs{display:flex;gap:6px}.reviewTabs a{padding:8px 12px;border:1px solid #d6d0c7;border-radius:999px;font-size:12px}.reviewTabs a.active{background:#17382c;color:#fff}.excludedCustomerPanel{margin-top:18px;padding:15px;border:1px solid #ead5cf;border-radius:12px;background:#fff8f6}.excludedCustomerPanel>div:first-child{display:flex;justify-content:space-between;gap:12px}.excludedCustomerPanel span,.excludedCustomerPanel small{color:#7a6a66;font-size:11px}.excludedCustomerList{display:grid;gap:7px;margin-top:11px;max-height:330px;overflow:auto}.excludedCustomerList article{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr) auto;gap:12px;align-items:center;padding:9px 10px;border-radius:8px;background:#fff}.excludedCustomerList article div{display:grid;gap:2px}.excludedCustomerList article p{margin:0;color:#7f3f32;font-size:12px}.excludedCustomerList article a{color:#176b55;font-size:11px}.reviewTableWrap{overflow:auto;margin-top:18px}.reviewTable{width:100%;border-collapse:collapse;min-width:1120px}.reviewTable th,.reviewTable td{text-align:left;padding:14px 12px;border-bottom:1px solid #e5e0d7;vertical-align:top}.reviewTable td>strong,.reviewTable td>small,.reviewTable td>a{display:block}.reviewTable td small{color:#7a827d}.reviewTable td>a,.contactStack a{font-size:11px;color:#176b55;max-width:260px;overflow:hidden;text-overflow:ellipsis}.contactStack{display:grid;gap:4px;min-width:190px;font-size:12px}.reviewTable summary{cursor:pointer;font-weight:700;color:#245947}.evidencePanel{max-width:470px;padding:10px 0;font-size:12px}.customsBadge{display:inline-block;margin:6px 0 3px;padding:3px 8px;border-radius:999px;background:#fff0cc;color:#8b5a00;font-size:11px;font-weight:800}.customsDetails{margin-top:9px}.customsDetails>div{max-height:280px;overflow:auto;margin-top:7px}.customsDetails article{display:grid;gap:2px;border-left:3px solid #d6a144;padding:7px 9px;margin:7px 0;background:#fff8e8;font-size:11px}.customsDetails article p{margin:2px 0}.reviewActions{display:flex;gap:6px}.reviewActions button{border:0;border-radius:8px;padding:8px 10px;cursor:pointer}.approveButton{background:#17382c;color:#fff}.rejectButton{background:#f5e8e3;color:#993d2e}.reviewPagination{display:flex;justify-content:center;gap:12px;align-items:center;padding-top:18px}.reviewPagination a{border:1px solid #ccd4d1;border-radius:8px;padding:7px 12px}.reviewPagination a[aria-disabled=true]{opacity:.4;pointer-events:none}@media(max-width:800px){.reviewHeader{display:block}.reviewTabs{margin-top:14px;overflow:auto}.excludedCustomerList article{grid-template-columns:1fr}.excludedCustomerPanel>div:first-child{align-items:flex-start;flex-direction:column}}`}</style>
  </main></div>;
}
