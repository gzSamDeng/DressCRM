import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { SystemUserForm } from "@/components/system-user-form";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppProfile, roleLabels, type AppPermissions, type AppProfile, type AppRole } from "@/lib/access-control";
import { createSalesTeam, updateSystemUser } from "@/app/settings/actions";
import "./settings.css";

type Team = { id: string; name: string; is_active: boolean };

function formatDate(value?: string | null) {
  if (!value) return "尚未登录";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const currentProfile = await getAppProfile(auth.user.id, auth.user.email);
  if (currentProfile.role !== "owner") {
    return <div className="shell"><Header/><main className="container settingsPage">
      <div className="pageHeader"><div><span className="pageKicker">SYSTEM SETTINGS</span><h2>系统设置</h2><p>账户、团队和权限由老板账号统一管理。</p></div></div>
      <section className="card settingsDenied"><strong>当前账号没有系统管理权限</strong><p>业务员只能查看本人数据；业务总监可以查看所属团队，但不能修改账号权限。</p></section>
    </main></div>;
  }

  const admin = createAdminClient();
  const [{ data: authData, error }, { data: profileData }, { data: teamData }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("user_profiles").select("id,email,display_name,role,team_id,manager_id,is_active,permissions").order("created_at"),
    admin.from("sales_teams").select("id,name,is_active").order("created_at"),
  ]);
  const users = authData?.users ?? [];
  const profiles = (profileData ?? []) as AppProfile[];
  const teams = (teamData ?? []) as Team[];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const teamMap = new Map(teams.map((team) => [team.id, team.name]));
  const managers = profiles
    .filter((profile) => profile.role === "sales_director" || profile.role === "owner")
    .map((profile) => ({
      id: profile.id,
      label: `${profile.display_name || profile.email || "未命名"} · ${roleLabels[profile.role]}`,
      role: profile.role,
    }));

  return <div className="shell"><Header/><main className="container settingsPage">
    <div className="pageHeader"><div><span className="pageKicker">SYSTEM SETTINGS</span><h2>账户、团队与权限</h2><p>通过角色模板控制个人、团队和全公司的数据范围，并可单独调整业务权限。</p></div><div className="settingsAdminBadge">老板账号：{auth.user.email}</div></div>

    <section className="card roleGuide">
      <div><strong>业务员</strong><span>只查看和跟进分配给自己的客户</span></div>
      <div><strong>业务总监</strong><span>查看所属团队，并在团队内部管理客户</span></div>
      <div><strong>老板</strong><span>查看全公司、跨团队比较并管理系统权限</span></div>
    </section>

    <div className="settingsLayout">
      <div className="settingsSidebar">
        <SystemUserForm teams={teams.filter((team) => team.is_active)} managers={managers}/>
        <form action={createSalesTeam} className="card teamCreateForm">
          <div><h3>创建销售团队</h3><p>例如：欧美组、俄罗斯组或礼服一组。</p></div>
          <label>团队名称<input name="team_name" minLength={2} maxLength={40} placeholder="输入团队名称" required/></label>
          <button className="primary" type="submit">创建团队</button>
        </form>
      </div>

      <section className="card accountListCard">
        <div className="accountListHeader"><div><h3>系统账号与权限</h3><p>修改角色后，下次打开页面即可按新范围显示数据。</p></div><strong>{users.length}</strong></div>
        {error ? <div className="settingsNotice error">账号列表读取失败：{error.message}</div> : null}
        <div className="accountList">
          {users.map((user) => {
            const profile = profileMap.get(user.id);
            const role = (profile?.role || "sales_rep") as AppRole;
            const permissions = (profile?.permissions || {}) as AppPermissions;
            return <article key={user.id} className="accountRow accountPermissionRow">
              <div className="accountIdentity">
                <div className="accountAvatar">{(profile?.display_name || user.user_metadata?.full_name || user.email || "U").slice(0, 1).toUpperCase()}</div>
                <div><strong>{profile?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "未命名账号"}</strong><span>{user.email}</span><small>{roleLabels[role]} · {profile?.team_id ? teamMap.get(profile.team_id) || "未知团队" : "未分配团队"}</small></div>
              </div>
              <form action={updateSystemUser} className="accountPermissionForm">
                <input type="hidden" name="user_id" value={user.id}/>
                <label>角色<select name="role" defaultValue={role}><option value="sales_rep">业务员</option><option value="sales_director">业务总监</option><option value="owner">老板</option></select></label>
                <label>团队<select name="team_id" defaultValue={profile?.team_id || ""}><option value="">未分配</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                <label>直属上级<select name="manager_id" defaultValue={profile?.manager_id || ""}><option value="">不指定</option>{managers.filter((manager) => manager.id !== user.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.label}</option>)}</select></label>
                <div className="inlinePermissions">
                  <label><input type="checkbox" name="can_review_leads" defaultChecked={permissions.can_review_leads ?? true}/>审核</label>
                  <label><input type="checkbox" name="can_run_ai_search" defaultChecked={permissions.can_run_ai_search ?? true}/>搜索</label>
                  <label><input type="checkbox" name="can_export_customers" defaultChecked={permissions.can_export_customers ?? false}/>导出</label>
                  <label><input type="checkbox" name="can_delete_customers" defaultChecked={permissions.can_delete_customers ?? false}/>删除</label>
                  <label><input type="checkbox" name="is_active" defaultChecked={profile?.is_active ?? true}/>启用</label>
                </div>
                <div className="accountSaveRow"><small>最近登录：{formatDate(user.last_sign_in_at)}</small><button type="submit">保存权限</button></div>
              </form>
            </article>;
          })}
          {!users.length && !error ? <p className="settingsEmpty">尚无系统账号。</p> : null}
        </div>
      </section>
    </div>
  </main></div>;
}
