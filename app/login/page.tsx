import Link from "next/link";
import { login } from "@/app/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="loginPage">
      <form action={login} className="loginCard form">
        <h1>冰锋外贸获客及管理系统</h1>
        <p className="muted">使用你在 Supabase Authentication 中创建的账号。</p>
        {params.message && <div className="success">{params.message}</div>}
        {params.error && <div className="error">{params.error}</div>}
        <label>邮箱<input type="email" name="email" required/></label>
        <label>密码<input type="password" name="password" required/></label>
        <button className="primary" type="submit">登录</button>
        <div className="loginLinks">
          <Link className="textLink" href="/forgot-password">忘记密码？</Link>
        </div>
      </form>
    </main>
  );
}
