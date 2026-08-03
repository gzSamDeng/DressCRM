"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

export function Header() {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");
  const isLeadIntelligence = pathname.startsWith("/lead-intelligence");
  const isCustomerLeads = pathname === "/" || pathname.startsWith("/customers");

  return (
    <header className="topbar">
      <Link className="brand" href="/lead-intelligence">
        <h1>冰锋外贸获客及管理系统</h1>
        <small>AI Lead Intelligence & Customer Management</small>
      </Link>
      <nav className="nav">
        <Link className={isDashboard ? "active" : ""} aria-current={isDashboard ? "page" : undefined} href="/dashboard">今日工作台</Link>
        <Link className={isLeadIntelligence ? "active" : ""} aria-current={isLeadIntelligence ? "page" : undefined} href="/lead-intelligence">AI 自动获客</Link>
        <Link className={isCustomerLeads ? "active" : ""} aria-current={isCustomerLeads ? "page" : undefined} href="/">客户线索</Link>
        <form action={logout}><button type="submit">退出登录</button></form>
      </nav>
    </header>
  );
}
