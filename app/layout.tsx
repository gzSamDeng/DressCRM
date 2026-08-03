import "./globals.css";
import "./system.css";
import "./search-status.css";
import "./follow-up.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "冰锋外贸获客及管理系统",
    template: "%s · 冰锋外贸获客及管理系统",
  },
  description: "AI 驱动的外贸获客、线索评分与客户管理系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
