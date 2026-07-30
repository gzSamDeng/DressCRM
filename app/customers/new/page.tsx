import { createCustomer } from "@/app/actions";
import { Header } from "@/components/header";
import { CustomerForm } from "@/components/customer-form";

export default function NewCustomerPage() {
  return <div className="shell"><Header/><main className="container formPage"><div className="breadcrumb">客户线索 <span>/</span> 新增线索</div><div className="pageHeader"><div><h2>新增客户线索</h2><p>手动补充一条线索。AI 自动获客审批通过的线索也会进入同一列表。</p></div></div><CustomerForm action={createCustomer}/></main></div>;
}
