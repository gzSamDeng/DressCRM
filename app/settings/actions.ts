"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppProfile, type AppPermissions, type AppRole } from "@/lib/access-control";

export type CreateSystemUserState = {
  ok: boolean;
  message: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedRoles = new Set<AppRole>(["sales_rep", "sales_director", "owner"]);

async function requireOwner() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const profile = await getAppProfile(auth.user.id, auth.user.email);
  return profile.role === "owner" ? profile : null;
}

function roleValue(formData: FormData): AppRole {
  const requested = String(formData.get("role") ?? "sales_rep") as AppRole;
  return allowedRoles.has(requested) ? requested : "sales_rep";
}

function nullableId(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function permissionPayload(formData: FormData): AppPermissions {
  return {
    can_review_leads: formData.get("can_review_leads") === "on",
    can_run_ai_search: formData.get("can_run_ai_search") === "on",
    can_export_customers: formData.get("can_export_customers") === "on",
    can_delete_customers: formData.get("can_delete_customers") === "on",
  };
}

export async function createSystemUser(
  _previousState: CreateSystemUserState,
  formData: FormData,
): Promise<CreateSystemUserState> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, message: "只有老板账号可以创建和设置系统账号。" };

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = roleValue(formData);
  const teamId = nullableId(formData, "team_id");
  const managerId = nullableId(formData, "manager_id");

  if (!emailPattern.test(email)) return { ok: false, message: "请输入正确的邮箱地址。" };
  if (password.length < 8) return { ok: false, message: "初始密码至少需要 8 个字符。" };
  if (password.length > 72) return { ok: false, message: "初始密码不能超过 72 个字符。" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { full_name: displayName } : undefined,
  });

  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message);
    return {
      ok: false,
      message: duplicate ? "这个邮箱已经是系统账号，请勿重复创建。" : `创建失败：${error.message}`,
    };
  }

  if (data.user) {
    await admin.from("user_profiles").upsert({
      id: data.user.id,
      email,
      display_name: displayName || email.split("@")[0],
      role,
      team_id: teamId,
      manager_id: managerId,
      permissions: permissionPayload(formData),
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath("/settings");
  return { ok: true, message: `账号 ${email} 已创建，可以使用初始密码登录。` };
}

export async function updateSystemUser(formData: FormData) {
  const owner = await requireOwner();
  if (!owner) throw new Error("只有老板账号可以修改账户权限。");

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) throw new Error("缺少用户编号。");
  if (userId === owner.id && roleValue(formData) !== "owner") {
    throw new Error("不能取消当前老板账号自己的老板权限。");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("user_profiles").update({
    role: roleValue(formData),
    team_id: nullableId(formData, "team_id"),
    manager_id: nullableId(formData, "manager_id"),
    is_active: userId === owner.id ? true : formData.get("is_active") === "on",
    permissions: permissionPayload(formData),
    updated_at: new Date().toISOString(),
  }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function createSalesTeam(formData: FormData) {
  const owner = await requireOwner();
  if (!owner) throw new Error("只有老板账号可以创建团队。");
  const name = String(formData.get("team_name") ?? "").trim();
  if (name.length < 2 || name.length > 40) throw new Error("团队名称需要 2–40 个字符。");

  const admin = createAdminClient();
  const { error } = await admin.from("sales_teams").insert({ name });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  revalidatePath("/settings");
}
