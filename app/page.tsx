import Link from "next/link";
import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; priority?: string; category?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("priority").order("company");
  const safeSearch = params.q?.trim().replace(/[,%()]/g, " ");
  if (safeSearch) query = query.or(`company.ilike.%${safeSearch}%,customer_type.ilike.%${safeSearch}%,notes.ilike.%${safeSearch}%`);
  if (params.priority) query = query.eq("priority", params.priority);
  if (params.category) query = query.eq("product_category", params.category);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const customers = (data ?? []) as Customer[];

  const { count: total } = await supabase.from("customers").select("*", { count: "exact", head: true });
  const { count: ap } = await supabase.from("customers").select("*", { count: "exact", head: true }).eq("priority","A+");
  const { count: premium } = await supabase.from("customers").select("*", { count: "exact", head: true }).gte("premium_fit",90);
  const { count: couture } = await supabase.from("customers").select("*", { count: "exact", head: true }).gte("couture_fit",90);

  return <div className="shell">
    <Header/>
    <main className="container">
      <div className="pageHeader">
        <div><span className="pageKicker">CUSTOMER LEADS</span><h2>客户线索</h2><p>集中管理 AI 获客和人工录入的全部线索、评分与跟进状态。</p></div>
        <Link className="primary addLeadButton" href="/customers/new"><span>＋</span> 新增线索</Link>
      </div>
      <section className="cards">
        {[["全部线索",total ?? 0],["A+ 高潜线索",ap ?? 0],["Premium 匹配 ≥ 90",premium ?? 0],["Couture 匹配 ≥ 90",couture ?? 0]].map(([k,v])=><div className="card metricCard" key={k}><div className="muted">{k}</div><div className="metric">{v}</div></div>)}
      </section>
      <form className="toolbar leadToolbar">
        <label className="searchField"><span className="srOnly">搜索线索</span><input name="q" placeholder="搜索公司、客户类型或备注…" defaultValue={params.q ?? ""}/></label>
        <select name="priority" defaultValue={params.priority ?? ""}><option value="">全部等级</option>{["A+","A","B","C","D"].map(x=><option key={x}>{x}</option>)}</select>
        <select name="category" defaultValue={params.category ?? ""}><option value="">全部产品线</option>{["Premium Evening Dress","Heavy Hand-beaded Couture","Both","Unclassified"].map(x=><option key={x}>{x}</option>)}</select>
        <button className="primary">应用筛选</button>
        {(params.q || params.priority || params.category) && <Link className="secondaryButton" href="/">清除筛选</Link>}
        <span className="resultCount">当前显示 {customers.length} 条</span>
      </form>
      <div className="tableWrap">
        <table className="table"><thead><tr><th>等级</th><th>公司</th><th>客户类型</th><th>产品分类</th><th>Premium</th><th>Couture</th><th>价格</th><th>进口概率</th><th>阶段</th><th>下次跟进</th><th>操作</th></tr></thead>
        <tbody>{customers.map(c=><tr key={c.id}>
          <td><span className={`badge ${c.priority==="A+"?"ap":""}`}>{c.priority}</span></td>
          <td><Link className="companyLink" href={`/customers/${c.id}`}><strong>{c.company}</strong><small>{[c.city,c.country].filter(Boolean).join(" · ")}</small></Link></td>
          <td>{c.customer_type || "—"}</td><td>{c.product_category}</td><td>{c.premium_fit}</td><td>{c.couture_fit}</td><td>{c.price_example || c.price_status || "—"}</td><td>{c.import_probability || "待确认"}</td><td><span className="stagePill">{c.stage}</span></td><td>{c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString("zh-CN") : "未安排"}</td>
          <td><div className="rowActions"><Link href={`/customers/${c.id}`}>查看</Link><Link href={`/customers/${c.id}/edit`}>编辑</Link></div></td>
        </tr>)}
        {!customers.length && <tr><td className="emptyTable" colSpan={11}><strong>没有找到符合条件的线索</strong><span>尝试清除筛选，或新增一条客户线索。</span><div><Link className="secondaryButton" href="/">清除筛选</Link><Link className="primary" href="/customers/new">新增线索</Link></div></td></tr>}
        </tbody></table>
      </div>
    </main>
  </div>;
}
