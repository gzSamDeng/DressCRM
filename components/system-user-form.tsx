"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSystemUser, type CreateSystemUserState } from "@/app/settings/actions";

const initialState: CreateSystemUserState = { ok: false, message: "" };

export function SystemUserForm() {
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
          业务员姓名（可选）
          <input name="display_name" placeholder="例如：李清妍" autoComplete="off" />
        </label>
        <label>
          登录邮箱
          <input name="email" type="email" placeholder="name@company.com" autoComplete="off" required />
        </label>
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
