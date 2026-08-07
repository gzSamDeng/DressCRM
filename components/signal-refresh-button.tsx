"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignalRefreshButton() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function refresh() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-signals/refresh", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "刷新失败");
      setMessage(`已检查 ${data.customersChecked} 家重点客户，新增 ${data.signalsSaved} 条商业信号。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setPending(false);
    }
  }
  return <div className="signalRefresh"><button className="secondaryButton" onClick={refresh} disabled={pending}>{pending ? "正在检索最新消息…" : "刷新客户商业信号"}</button>{message && <small>{message}</small>}</div>;
}
