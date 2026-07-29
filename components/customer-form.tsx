import type { Customer } from "@/types/database";

const stages = ["New Lead","Qualified","Email Sent","Waiting for Reply","Replied","WhatsApp Contacted","Meeting Scheduled","Quotation","Sampling","Order","Repeat Order","Not Interested"];
const categories = ["Premium Evening Dress","Heavy Hand-beaded Couture","Both","Unclassified"];

export function CustomerForm({ customer, action }: { customer?: Customer; action: (formData: FormData) => void | Promise<void> }) {
  const c = customer;
  return (
    <form action={action} className="form card">
      <div className="grid2">
        <label>公司名称<input name="company" required defaultValue={c?.company ?? ""}/></label>
        <label>官网<input name="website" defaultValue={c?.website ?? ""}/></label>
        <label>国家<input name="country" defaultValue={c?.country ?? "Turkey"}/></label>
        <label>城市<input name="city" defaultValue={c?.city ?? ""}/></label>
        <label>客户类型<input name="customer_type" defaultValue={c?.customer_type ?? ""}/></label>
        <label>等级<select name="priority" defaultValue={c?.priority ?? "B"}>{["A+","A","B","C","D"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>阶段<select name="stage" defaultValue={c?.stage ?? "New Lead"}>{stages.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>产品分类<select name="product_category" defaultValue={c?.product_category ?? "Unclassified"}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Premium匹配度<input name="premium_fit" type="number" min="0" max="100" defaultValue={c?.premium_fit ?? 0}/></label>
        <label>Couture匹配度<input name="couture_fit" type="number" min="0" max="100" defaultValue={c?.couture_fit ?? 0}/></label>
        <label>价格状态<input name="price_status" defaultValue={c?.price_status ?? ""}/></label>
        <label>价格示例<input name="price_example" defaultValue={c?.price_example ?? ""}/></label>
        <label>进口概率<input name="import_probability" defaultValue={c?.import_probability ?? ""}/></label>
        <label>客户价值<input name="buyer_value" defaultValue={c?.buyer_value ?? ""}/></label>
        <label>邮箱<input name="contact_email" type="email" defaultValue={c?.contact_email ?? ""}/></label>
        <label>WhatsApp<input name="whatsapp" defaultValue={c?.whatsapp ?? ""}/></label>
        <label>下次跟进<input name="next_follow_up_at" type="datetime-local" defaultValue={c?.next_follow_up_at?.slice(0,16) ?? ""}/></label>
        <label>来源网址<input name="source_url" defaultValue={c?.source_url ?? ""}/></label>
      </div>
      <label>建议产品线<textarea name="recommended_line" defaultValue={c?.recommended_line ?? ""}/></label>
      <label>判断依据<textarea name="evidence" defaultValue={c?.evidence ?? ""}/></label>
      <label>备注<textarea name="notes" defaultValue={c?.notes ?? ""}/></label>
      <button className="primary" type="submit">保存客户</button>
    </form>
  );
}
