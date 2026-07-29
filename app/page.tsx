import Link from "next/link";
import { Header } from "@/components/header";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; priority?: string; category?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("customers").select("*").order("priority").order("company");
  if (params.q) query = query.or(`company.ilike.%${params.q}%,customer_type.ilike.%${params.q}%,notes.ilike.%${params.q}%`);
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
      <section className="cards">
        {[["数据库客户",total ?? 0],["A+客户",ap ?? 0],["Premium匹配≥90",premium ?? 0],["Couture匹配≥90",couture ?? 0]].map(([k,v])=><div className="card" key={k}><div className="muted">{k}</div><div className="metric">{v}</div></div>)}
      </section>
      <form className="toolbar">
        <input name="q" placeholder="搜索公司、类型、备注…" defaultValue={params.q ?? ""}/>
        <select name="priority" defaultValue={params.priority ?? ""}><option value="">全部等级</option>{["A+","A","B","C","D"].map(x=><option key={x}>{x}</option>)}</select>
        <select name="category" defaultValue={params.category ?? ""}><option value="">全部产品线</option>{["Premium Evening Dress","Heavy Hand-beaded Couture","Both","Unclassified"].map(x=><option key={x}>{x}</option>)}</select>
        <button className="primary">筛选</button>
        <Link className="primary" href="/customers/new">新增客户</Link>
      </form>
      <div className="tableWrap">
        <table className="table"><thead><tr><th>等级</th><th>公司</th><th>客户类型</th><th>产品分类</th><th>Premium</th><th>Couture</th><th>价格</th><th>进口概率</th><th>阶段</th><th>下次跟进</th></tr></thead>
        <tbody>{customers.map(c=><tr key={c.id}>
          <td><span className={`badge ${c.priority==="A+"?"ap":""}`}>{c.priority}</span></td>
          <td><Link href={`/customers/${c.id}`}><strong>{c.company}</strong></Link></td>
          <td>{c.customer_type}</td><td>{c.product_category}</td><td>{c.premium_fit}</td><td>{c.couture_fit}</td><td>{c.price_example || c.price_status}</td><td>{c.import_probability}</td><td>{c.stage}</td><td>{c.next_follow_up_at ? new Date(c.next_follow_up_at).toLocaleDateString("zh-CN") : ""}</td>
        </tr>)}</tbody></table>
      </div>
    </main>
  </div>;
}
