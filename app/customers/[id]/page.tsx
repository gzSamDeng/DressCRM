import Link from "next/link";
import { notFound } from "next/navigation";
import { addFollowUp, deleteCustomer } from "@/app/actions";
import { Header } from "@/components/header";
import { DeleteLeadForm } from "@/components/delete-lead-form";
import { FollowUpForm } from "@/components/follow-up-form";
import { createClient } from "@/lib/supabase/server";
import type { Customer, FollowUp } from "@/types/database";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: customer }, { data: followUps }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("follow_ups").select("*").eq("customer_id", id).order("happened_at", { ascending: false }),
  ]);
  if (!customer) notFound();
  const c = customer as Customer;
  const addAction = addFollowUp.bind(null, id);
  const delAction = deleteCustomer.bind(null, id);

  const fields = [
    ["官网", c.website],["国家/城市",[c.country,c.city].filter(Boolean).join(" / ")],["客户类型",c.customer_type],
    ["等级",c.priority],["阶段",c.stage],["产品分类",c.product_category],["Premium匹配",c.premium_fit],["Couture匹配",c.couture_fit],
    ["价格",c.price_example || c.price_status],["进口概率",c.import_probability],["邮箱",c.contact_email],["WhatsApp",c.whatsapp],
    ["建议产品线",c.recommended_line],["判断依据",c.evidence],["备注",c.notes]
  ];

  return <div className="shell"><Header/><main className="container">
    <div className="breadcrumb"><Link href="/">客户线索</Link> <span>/</span> {c.company}</div>
    <div className="sectionTitle"><div><h2>{c.company}</h2><p className="muted">{[c.city,c.country,c.customer_type].filter(Boolean).join(" · ")}</p></div><div className="toolbar"><Link className="secondaryButton" href="/">返回列表</Link><Link className="primary" href={`/customers/${id}/edit`}>编辑线索</Link><DeleteLeadForm action={delAction} company={c.company}/></div></div>
    <div className="grid2">
      <section className="card"><h3>线索资料</h3><div className="detailGrid">{fields.map(([k,v])=><div key={String(k)}><strong>{k}</strong><br/>{String(v ?? "—")}</div>)}</div></section>
      <section className="card"><h3>新增跟进记录</h3><FollowUpForm action={addAction}/></section>
    </div>
    <section className="card" style={{marginTop:16}}><h3>跟进历史</h3><div className="timeline">{(followUps as FollowUp[] ?? []).map(f=><div className="timelineItem" key={f.id}><strong>{new Date(f.happened_at).toLocaleString("zh-CN")} · {f.channel}</strong><p>{f.summary}</p><small>{f.outcome || ""} {f.next_action ? `｜下一步：${f.next_action}` : ""}</small></div>)}{!followUps?.length && <p className="muted">还没有跟进记录。</p>}</div></section>
  </main></div>;
}
