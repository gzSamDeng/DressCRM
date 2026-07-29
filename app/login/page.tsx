import { login } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="loginPage">
      <form action={login} className="loginCard form">
        <h1>DressCRM 登录</h1>
        <p className="muted">使用你在 Supabase Authentication 中创建的账号。</p>
        {params.error && <div className="error">{params.error}</div>}
        <label>邮箱<input type="email" name="email" required/></label>
        <label>密码<input type="password" name="password" required/></label>
        <button className="primary" type="submit">登录</button>
      </form>
    </main>
  );
}
