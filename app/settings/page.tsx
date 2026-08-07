import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { SystemUserForm } from "@/components/system-user-form";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSystemAdmin, systemAdminAddress } from "@/lib/system-admin";
import "./settings.css";

function formatDate(value?: string | null) {
  if (!value) return "尚未登录";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const canManageUsers = isSystemAdmin(auth.user.email);
  if (!canManageUsers) {
    return (
      <div className="shell">
        <Header />
        <main className="container settingsPage">
          <div className="pageHeader">
            <div>
              <span className="pageKicker">SYSTEM SETTINGS</span>
              <h2>系统设置</h2>
              <p>当前账号没有系统账号管理权限。</p>
            </div>
          </div>
          <section className="card settingsDenied">
            <strong>仅系统管理员可以创建账号</strong>
            <p>请使用管理员账号 {systemAdminAddress()} 登录后操作。</p>
          </section>
        </main>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = data?.users ?? [];

  return (
    <div className="shell">
      <Header />
      <main className="container settingsPage">
        <div className="pageHeader">
          <div>
            <span className="pageKicker">SYSTEM SETTINGS</span>
            <h2>系统设置</h2>
            <p>创建内部使用账号并设置初始登录密码。</p>
          </div>
          <div className="settingsAdminBadge">管理员：{auth.user.email}</div>
        </div>

        <div className="settingsLayout">
          <SystemUserForm />

          <section className="card accountListCard">
            <div className="accountListHeader">
              <div>
                <h3>系统账号</h3>
                <p>当前 Supabase Authentication 中的登录用户。</p>
              </div>
              <strong>{users.length}</strong>
            </div>

            {error ? <div className="settingsNotice error">账号列表读取失败：{error.message}</div> : null}

            <div className="accountList">
              {users.map((user) => (
                <article key={user.id} className="accountRow">
                  <div className="accountAvatar">
                    {(user.user_metadata?.full_name || user.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{user.user_metadata?.full_name || user.email?.split("@")[0] || "未命名账号"}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div className="accountMeta">
                    <span>{user.email_confirmed_at ? "已启用" : "待确认"}</span>
                    <small>最近登录：{formatDate(user.last_sign_in_at)}</small>
                  </div>
                </article>
              ))}
              {!users.length && !error ? <p className="settingsEmpty">尚无系统账号。</p> : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
