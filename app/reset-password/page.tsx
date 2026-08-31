import { redirect } from "next/navigation";
import { updatePassword } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?error=" + encodeURIComponent("密码重置链接无效或已过期，请重新申请。"));
  }

  return (
    <main className="loginPage">
      <form action={updatePassword} className="loginCard form">
        <h1>设置新密码</h1>
        <p className="muted">新密码至少需要 8 个字符，设置完成后请重新登录。</p>
        {params.error && <div className="error">{params.error}</div>}
        <label>
          新密码
          <input type="password" name="password" minLength={8} autoComplete="new-password" required />
        </label>
        <label>
          确认新密码
          <input
            type="password"
            name="confirmPassword"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="primary" type="submit">更新密码</button>
      </form>
    </main>
  );
}
