"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSystemUser, type CreateSystemUserState } from "@/app/settings/actions";
import type { AppRole } from "@/lib/access-control";

const initialState: CreateSystemUserState = { ok: false, message: "" };

type TeamOption = { id: string; name: string };
type ManagerOption = { id: string; label: string; role: AppRole };

export function SystemUserForm({ teams, managers }: { teams: TeamOption[]; managers: ManagerOption[] }) {
  const [state, formAction, pending] = useActionState(createSystemUser, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok, state.message]);

  return (
    <form ref={formRef} action={formAction} className="settingsForm">
      <div className="settingsFormHeader">
        <div>
          <h3>创建系统账号</h3>
          <p>创建后邮箱自动确认，业务员可立即使用邮箱和初始密码登录。</p>
        </div>
        <span>管理员操作</span>
      </div>

      {state.message ? (
        <div className={state.ok ? "settingsNotice success" : "settingsNotice error"} role="status">
          {state.message}
        </div>
      ) : null}

      <div className="settingsFields">
        <label>
          姓名（可选）
          <input name="display_name" placeholder="例如：李清妍" autoComplete="off" />
        </label>
        <label>
          登录邮箱
          <input name="email" type="email" placeholder="name@company.com" autoComplete="off" required />
        </label>
        <label>
          账户角色
          <select name="role" defaultValue="sales_rep">
            <option value="sales_rep">业务员 · 仅本人数据</option>
            <option value="sales_director">业务总监 · 所属团队数据</option>
            <option value="owner">老板 · 全公司数据</option>
          </select>
        </label>
        <label>
          所属团队
          <select name="team_id" defaultValue={teams[0]?.id ?? ""}>
            <option value="">暂不分配团队</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label>
          直属上级（可选）
          <select name="manager_id" defaultValue="">
            <option value="">不指定</option>
            {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.label}</option>)}
          </select>
        </label>
        <fieldset className="permissionFields">
          <legend>业务权限</legend>
          <label><input type="checkbox" name="can_review_leads" defaultChecked />审核AI线索</label>
          <label><input type="checkbox" name="can_run_ai_search" defaultChecked />运行AI搜索</label>
          <label><input type="checkbox" name="can_export_customers" />导出客户</label>
          <label><input type="checkbox" name="can_delete_customers" />删除客户</label>
        </fieldset>
        <label className="passwordField">
          初始密码
          <span className="passwordInputWrap">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              minLength={8}
              maxLength={72}
              placeholder="至少 8 个字符"
              autoComplete="new-password"
              required
            />
            <button type="button" onClick={() => setShowPassword((shown) => !shown)}>
              {showPassword ? "隐藏" : "显示"}
            </button>
          </span>
        </label>
      </div>

      <div className="settingsFormFooter">
        <p>系统不会在客户数据库中保存密码。</p>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "正在创建…" : "创建账号"}
        </button>
      </div>
    </form>
  );
}
