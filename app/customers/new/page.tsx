import { createCustomer } from "@/app/actions";
import { Header } from "@/components/header";
import { CustomerForm } from "@/components/customer-form";

export default function NewCustomerPage() {
  return <div className="shell"><Header/><main className="container"><h2>新增客户</h2><CustomerForm action={createCustomer}/></main></div>;
}
