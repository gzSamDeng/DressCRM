import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSystemAdmin } from "@/lib/system-admin";

export type AppRole = "sales_rep" | "sales_director" | "owner";

export type AppPermissions = {
  can_review_leads?: boolean;
  can_run_ai_search?: boolean;
  can_export_customers?: boolean;
  can_delete_customers?: boolean;
};

export type AppProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  team_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  permissions: AppPermissions;
};

export const roleLabels: Record<AppRole, string> = {
  sales_rep: "业务员",
  sales_director: "业务总监",
  owner: "老板",
};

export function isManagementRole(role: AppRole) {
  return role === "owner" || role === "sales_director";
}

export function permissionEnabled(
  profile: Pick<AppProfile, "role" | "permissions">,
  permission: keyof AppPermissions,
  fallback = false,
) {
  if (profile.role === "owner") return true;
  return profile.permissions?.[permission] ?? fallback;
}

export async function getAppProfile(userId: string, email?: string | null): Promise<AppProfile> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_profiles")
    .select("id,email,display_name,role,team_id,manager_id,is_active,permissions")
    .eq("id", userId)
    .maybeSingle();

  if (data) {
    return {
      ...data,
      role: isSystemAdmin(email) ? "owner" : (data.role as AppRole),
      permissions: (data.permissions ?? {}) as AppPermissions,
    };
  }

  const systemAdmin = isSystemAdmin(email);
  return {
    id: userId,
    email: email ?? null,
    display_name: email?.split("@")[0] ?? "未命名用户",
    role: systemAdmin ? "owner" : "sales_rep",
    team_id: null,
    manager_id: null,
    is_active: systemAdmin,
    permissions: {},
  };
}
