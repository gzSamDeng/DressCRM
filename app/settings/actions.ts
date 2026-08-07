"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSystemAdmin } from "@/lib/system-admin";

export type CreateSystemUserState = {
  ok: boolean;
  message: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createSystemUser(
  _previousState: CreateSystemUserState,
  formData: FormData,
): Promise<CreateSystemUserState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) return { ok: false, message: "请先登录系统。" };
  if (!isSystemAdmin(auth.user.email)) {
    return { ok: false, message: "只有系统管理员可以创建账号。" };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

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
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath("/settings");
  return { ok: true, message: `账号 ${email} 已创建，可以使用初始密码登录。` };
}
