import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="loginPage">
      <form action={requestPasswordReset} className="loginCard form">
        <h1>找回密码</h1>
        <p className="muted">输入登录邮箱，我们会向该邮箱发送密码重置链接。</p>
        {params.sent === "1" && (
          <div className="success">
            如果该邮箱已注册，重置链接会发送到邮箱。请同时检查垃圾邮件文件夹。
          </div>
        )}
        {params.error && <div className="error">{params.error}</div>}
        <label>
          登录邮箱
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <button className="primary" type="submit">发送重置链接</button>
        <div className="loginLinks">
          <Link className="textLink" href="/login">返回登录</Link>
        </div>
      </form>
    </main>
  );
}
