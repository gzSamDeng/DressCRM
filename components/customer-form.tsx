import type { Customer } from "@/types/database";
import Link from "next/link";

const stages = ["New Lead","Qualified","Email Sent","Waiting for Reply","Replied","WhatsApp Contacted","Meeting Scheduled","Quotation","Sampling","Order","Repeat Order","Not Interested"];
const categories = ["Premium Evening Dress","Heavy Hand-beaded Couture","Both","Unclassified"];

export function CustomerForm({ customer, action }: { customer?: Customer; action: (formData: FormData) => void | Promise<void> }) {
  const c = customer;
  return (
    <form action={action} className="form card leadForm">
      <div className="formSectionHeading"><div><h3>基本资料</h3><p>公司识别、地区和联系人信息</p></div><span>必填项标有 *</span></div>
      <div className="grid2">
        <label>公司名称 *<input name="company" required autoFocus placeholder="例如：ABC Fashion Group" defaultValue={c?.company ?? ""}/></label>
        <label>官网<input name="website" type="url" placeholder="https://" defaultValue={c?.website ?? ""}/></label>
        <label>国家<input name="country" defaultValue={c?.country ?? "Turkey"}/></label>
        <label>城市<input name="city" defaultValue={c?.city ?? ""}/></label>
        <label>客户类型<input name="customer_type" placeholder="进口商、买手店、零售商…" defaultValue={c?.customer_type ?? ""}/></label>
        <label>邮箱<input name="contact_email" type="email" placeholder="buyer@company.com" defaultValue={c?.contact_email ?? ""}/></label>
        <label>WhatsApp<input name="whatsapp" type="tel" placeholder="+90 …" defaultValue={c?.whatsapp ?? ""}/></label>
        <label>Instagram<input name="instagram" placeholder="https://www.instagram.com/company/ 或 @company" defaultValue={c?.instagram ?? ""}/></label>
        <label>来源网址<input name="source_url" type="url" placeholder="https://" defaultValue={c?.source_url ?? ""}/></label>
      </div>
      <div className="formSectionHeading"><div><h3>评估与状态</h3><p>线索优先级、产品匹配和跟进阶段</p></div></div>
      <div className="grid2">
        <label>等级<select name="priority" defaultValue={c?.priority ?? "B"}>{["A+","A","B","C","D"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>阶段<select name="stage" defaultValue={c?.stage ?? "New Lead"}>{stages.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>产品分类<select name="product_category" defaultValue={c?.product_category ?? "Unclassified"}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Premium匹配度<input name="premium_fit" type="number" min="0" max="100" defaultValue={c?.premium_fit ?? 0}/></label>
        <label>Couture匹配度<input name="couture_fit" type="number" min="0" max="100" defaultValue={c?.couture_fit ?? 0}/></label>
        <label>价格状态<input name="price_status" defaultValue={c?.price_status ?? ""}/></label>
        <label>价格示例<input name="price_example" defaultValue={c?.price_example ?? ""}/></label>
        <label>进口概率<input name="import_probability" defaultValue={c?.import_probability ?? ""}/></label>
        <label>客户价值<input name="buyer_value" defaultValue={c?.buyer_value ?? ""}/></label>
        <label>下次跟进<input name="next_follow_up_at" type="datetime-local" defaultValue={c?.next_follow_up_at?.slice(0,16) ?? ""}/></label>
      </div>
      <div className="formSectionHeading"><div><h3>AI 判断与备注</h3><p>保存推荐理由和核验信息，便于团队复查</p></div></div>
      <label>建议产品线<textarea name="recommended_line" defaultValue={c?.recommended_line ?? ""}/></label>
      <label>判断依据<textarea name="evidence" defaultValue={c?.evidence ?? ""}/></label>
      <label>备注<textarea name="notes" defaultValue={c?.notes ?? ""}/></label>
      <div className="formActions"><Link className="secondaryButton" href={c ? `/customers/${c.id}` : "/"}>取消</Link><button className="primary" type="submit">{c ? "保存修改" : "创建线索"}</button></div>
    </form>
  );
}
