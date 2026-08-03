"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FollowUpActionState } from "@/app/actions";

const initialState: FollowUpActionState = { ok: false, message: "" };

export function FollowUpForm({ action }: {
  action: (state: FollowUpActionState, formData: FormData) => Promise<FollowUpActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state]);

  return <form ref={formRef} action={formAction} className="form">
    <label>渠道<select name="channel">{["Email","WhatsApp","Phone","LinkedIn","Website Form","Meeting"].map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>时间<input name="happened_at" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)}/></label>
    <label>跟进摘要<textarea name="summary" required/></label>
    <label>结果<select name="outcome" defaultValue="无回复"><option>无回复</option><option>已回复</option><option>有兴趣</option><option>要求报价</option><option>要求样品</option><option>采购计划明确</option><option>暂无采购计划</option><option>明确拒绝</option><option>退订</option><option>联系方式无效</option></select></label>
    <label>下一步<input name="next_action"/></label>
    <label>人工指定下次跟进日期（可选）<input name="next_follow_up_at" type="date"/></label>
    {state.message && <p role="status" className={state.ok ? "formSuccess" : "formError"}>{state.message}</p>}
    <button className="primary" disabled={pending}>{pending ? "正在保存…" : "保存跟进"}</button>
  </form>;
}
