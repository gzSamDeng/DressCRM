"use client";

import { useState } from "react";
import Link from "next/link";

type ImportResult = {
  error?: string;
  processed?: number;
  nextOffset?: number;
  total?: number;
  imported?: number;
  complete?: boolean;
};

export default function ImportExhibitorsPage() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(119);
  const [message, setMessage] = useState("准备导入 IF Wedding Fashion İzmir 2026 B 馆展商。重点核实公开官网、邮箱、电话、WhatsApp 和社媒账号。");

  async function startImport() {
    setRunning(true);
    setMessage("正在搜索并评分，请保持此页面打开……");
    try {
      let offset = 0;
      while (offset < total) {
        let payload: ImportResult | null = null;
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
          try {
            const response = await fetch("/api/lead-intelligence/import-exhibitors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ offset, limit: 4 }),
            });
            const raw = await response.text();
            if (!raw) throw new Error("服务器返回为空，请稍后重试。");
            payload = JSON.parse(raw) as ImportResult;
            if (!response.ok || payload.error) throw new Error(payload.error ?? "导入失败。");
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error("导入失败。");
            payload = null;
            if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          }
        }
        if (!payload) throw lastError ?? new Error("导入失败。");
        offset = payload.nextOffset ?? total;
        setProgress(offset);
        setTotal(payload.total ?? total);
        setMessage(`正在核实 ${offset} / ${payload.total ?? total}；数据库现有 ${payload.imported ?? offset} 条该展会线索。`);
        if (payload.complete) break;
      }
      setMessage("导入完成。全部线索已按 AI Score 排序进入待审核列表。");
    } catch (error) {
      setMessage(error instanceof Error ? `导入暂停：${error.message}` : "导入暂停，请重试。");
    } finally {
      setRunning(false);
    }
  }

  return <main style={{maxWidth:760,margin:"60px auto",padding:24,fontFamily:"Arial,sans-serif"}}>
    <p style={{color:"#82745f",fontWeight:700}}>EXHIBITOR LEAD IMPORT</p>
    <h1 style={{fontFamily:"Georgia,serif",fontSize:42}}>展会线索批量导入</h1>
    <p style={{lineHeight:1.7,color:"#56615d"}}>{message}</p>
    <div style={{height:12,background:"#e8e2d8",borderRadius:99,overflow:"hidden",margin:"28px 0 10px"}}>
      <div style={{height:"100%",width:`${Math.min(100,(progress/Math.max(1,total))*100)}%`,background:"#1e6a52",transition:"width .3s"}} />
    </div>
    <strong>{progress} / {total}</strong>
    <div style={{display:"flex",gap:12,marginTop:28}}>
      <button onClick={startImport} disabled={running} style={{border:0,borderRadius:10,padding:"13px 22px",background:"#17382c",color:"white",fontWeight:700,cursor:"pointer"}}>
        {running ? "正在导入……" : progress ? "继续/重新核实" : "开始导入 119 家展商"}
      </button>
      <Link href="/lead-intelligence?reviewStatus=pending#review-center" style={{border:"1px solid #cfc8bc",borderRadius:10,padding:"13px 22px"}}>查看待审核列表</Link>
    </div>
  </main>;
}
