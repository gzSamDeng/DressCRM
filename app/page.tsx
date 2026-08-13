import Link from "next/link";
import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";
import { getAppProfile, isManagementRole, type AppProfile } from "@/lib/access-control";
import { assignCustomer } from "@/app/actions";
import type { Customer } from "@/types/database";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; priority?: string; category?: string; owner?: string; page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 20;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const currentProfile = auth.user ? await getAppProfile(auth.user.id, auth.user.email) : null;
  const management = Boolean(currentProfile && isManagementRole(currentProfile.role));
  const { data: profileData } = management
    ? await supabase.from("user_profiles").select("id,email,display_name,role,team_id,manager_id,is_active,permissions").eq("is_active", true)
    : { data: [] };
  const ownerOptions = (profileData ?? []) as AppProfile[];
  const ownerMap = new Map(ownerOptions.map((profile) => [profile.id, profile.display_name || profile.email || "未命名业务员"]));
  let query = supabase.from("customers").select("*", { count: "exact" }).eq("is_excluded", false);
  const safeSearch = params.q?.trim().replace(/[,%()]/g, " ");
  if (safeSearch) query = query.or(`company.ilike.%${safeSearch}%,customer_type.ilike.%${safeSearch}%,notes.ilike.%${safeSearch}%`);
  if (params.priority) query = query.eq("priority", params.priority);
  if (params.category) query = query.eq("product_category", params.category);
  if (params.owner === "unassigned") query = query.is("owner_id", null);
  else if (params.owner) query = query.eq("owner_id", params.owner);
  const { data, count: filteredTotal, error } = await query;
  if (error) throw new Error(error.message);
  const priorityRank: Record<string, number> = { "A+": 0, A: 1, B: 2, C: 3, D: 4 };
  const followRank = (customer: Customer) => customer.next_follow_up_at ? 0 : 1;
  const sortedCustomers = ((data ?? []) as Customer[]).sort((a, b) =>
    (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)
    || followRank(a) - followRank(b)
    || (a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Number.MAX_SAFE_INTEGER)
      - (b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Number.MAX_SAFE_INTEGER)
    || a.company.localeCompare(b.company),
  );
  const customers = sortedCustomers.slice((page - 1) * pageSize, page * pageSize);

  const { count: total } = await supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_excluded", false);
  const { count: ap } = await supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_excluded", false).eq("priority","A+");
  const { count: premium } = await supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_excluded", false).gte("premium_fit",90);
  const { count: couture } = await supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_excluded", false).gte("couture_fit",90);
  const pageCount = Math.max(1, Math.ceil((filteredTotal ?? 0) / pageSize));
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.priority) next.set("priority", params.priority);
    if (params.category) next.set("category", params.category);
    if (params.owner) next.set("owner", params.owner);
    next.set("page", String(nextPage));
    return `/?${next.toString()}`;
  };

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
        {management && <select name="owner" defaultValue={params.owner ?? ""}><option value="">全部负责人</option><option value="unassigned">尚未分配</option>{ownerOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name || profile.email}</option>)}</select>}
        <button className="primary">应用筛选</button>
        {(params.q || params.priority || params.category || params.owner) && <Link className="secondaryButton" href="/">清除筛选</Link>}
        <span className="resultCount">当前显示 {customers.length} 条 · 筛选结果 {filteredTotal ?? 0} / 全部 {total ?? 0} 条</span>
      </form>
      <div className="tableWrap">
        <table className="table"><thead><tr><th>等级</th><th>公司</th><th>客户类型</th><th>产品分类</th><th>Premium</th><th>Couture</th><th>价格</th><th>进口概率</th><th>阶段</th><th>下次跟进</th>{management && <th>负责人</th>}<th>操作</th></tr></thead>
        <tbody>{customers.map(c=><tr key={c.id}>
          <td><span className={`badge ${c.priority==="A+"?"ap":""}`}>{c.priority}</span></td>
          <td><Link className="companyLink" href={`/customers/${c.id}`}><strong>{c.company}</strong><small>{[c.city,c.country].filter(Boolean).join(" · ")}</small>{c.has_customs_import_records && <small style={{color:"#8b5a00",fontWeight:800}}>海关进口 {c.customs_import_count} 次 · 最近 {c.latest_customs_import_at}</small>}</Link></td>
          <td>{c.customer_type || "—"}</td><td>{c.product_category}</td><td>{c.premium_fit}</td><td>{c.couture_fit}</td><td>{c.price_example || c.price_status || "—"}</td><td>{c.import_probability || "待确认"}</td><td><span className="stagePill">{c.stage}</span></td><td>{c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString("zh-CN") : "未安排"}</td>{management && <td><form action={assignCustomer.bind(null, c.id)} className="ownerAssignForm"><select name="owner_id" defaultValue={c.owner_id || ""}><option value="">未分配</option>{ownerOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name || profile.email}</option>)}</select><button type="submit">保存</button></form><small className="ownerName">当前：{c.owner_id ? ownerMap.get(c.owner_id) || "未知人员" : "未分配"}</small></td>}
          <td><div className="rowActions"><Link href={`/customers/${c.id}`}>查看</Link><Link href={`/customers/${c.id}/edit`}>编辑</Link></div></td>
        </tr>)}
        {!customers.length && <tr><td className="emptyTable" colSpan={management ? 12 : 11}><strong>没有找到符合条件的线索</strong><span>尝试清除筛选，或新增一条客户线索。</span><div><Link className="secondaryButton" href="/">清除筛选</Link><Link className="primary" href="/customers/new">新增线索</Link></div></td></tr>}
        </tbody></table>
      </div>
      <div className="pagination"><Link aria-disabled={page <= 1} href={pageHref(Math.max(1, page - 1))}>上一页</Link><span>第 {page} / {pageCount} 页</span><Link aria-disabled={page >= pageCount} href={pageHref(Math.min(pageCount, page + 1))}>下一页</Link></div>
    </main>
  </div>;
}
