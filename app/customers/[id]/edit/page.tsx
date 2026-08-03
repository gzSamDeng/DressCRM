import { notFound } from "next/navigation";
import { updateCustomer } from "@/app/actions";
import { Header } from "@/components/header";
import { CustomerForm } from "@/components/customer-form";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/types/database";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("customers").select("*").eq("id", id).single();
  if (!data) notFound();
  const action = updateCustomer.bind(null, id);
  return <div className="shell"><Header/><main className="container formPage"><div className="breadcrumb">客户线索 <span>/</span> {data.company} <span>/</span> 编辑</div><div className="pageHeader"><div><h2>编辑客户线索</h2><p>更新公司资料、AI 评分信息和当前跟进状态。</p></div></div><CustomerForm customer={data as Customer} action={action}/></main></div>;
}
