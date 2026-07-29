import Link from "next/link";
import { logout } from "@/app/actions";

export function Header() {
  return (
    <header className="topbar">
      <div>
        <h1>晚礼服外贸获客 · DressCRM</h1>
        <small>Turkey Lead Intelligence & Outreach CRM</small>
      </div>
      <nav className="nav">
        <Link href="/">客户数据库</Link>
        <Link href="/customers/new">新增客户</Link>
        <form action={logout}><button type="submit">退出登录</button></form>
      </nav>
    </header>
  );
}
