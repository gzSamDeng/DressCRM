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
    <label>渠道<select name="channel">{["Email","WhatsApp","Phone","LinkedIn","Website Form","Meeting"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>时间<input name="happened_at" type="datetime-local" defaultValue={new Date().toISOString().slice(0,16)}/></label>
    <label>跟进摘要<textarea name="summary" required/></label>
    <label>结果<input name="outcome"/></label>
    <label>下一步<input name="next_action"/></label>
    {state.message && <p role="status" className={state.ok ? "formSuccess" : "formError"}>{state.message}</p>}
    <button className="primary" disabled={pending}>{pending ? "正在保存…" : "保存跟进"}</button>
  </form>;
}
