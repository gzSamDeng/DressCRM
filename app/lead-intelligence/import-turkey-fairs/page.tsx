"use client";

import Link from "next/link";
import { useState } from "react";

type ImportResult = {
  error?: string;
  reviewed?: number;
  newCount?: number;
  newCompanies?: string[];
  inserted?: number;
  insertedCompanies?: string[];
  duplicates?: Array<{ company: string; reason?: string }>;
};

export default function ImportTurkeyFairsPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport(commit: boolean) {
    setRunning(true);
    try {
      const response = await fetch("/api/lead-intelligence/import-turkey-fairs", {
        method: commit ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: commit ? JSON.stringify({}) : undefined,
      });
      const payload = await response.json() as ImportResult;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "操作失败。");
      setResult(payload);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "操作失败。" });
    } finally {
      setRunning(false);
    }
  }

  return <main style={{maxWidth:820,margin:"60px auto",padding:24,fontFamily:"Arial,sans-serif"}}>
    <p style={{color:"#82745f",fontWeight:700}}>VERIFIED TURKEY FAIR LEADS</p>
    <h1 style={{fontFamily:"Georgia,serif",fontSize:42}}>土耳其展会目标客户导入</h1>
    <p style={{lineHeight:1.7,color:"#56615d"}}>
      仅处理官方参展商目录中与晚礼服匹配，并具有公开采购、外包或联系方式证据的企业。系统会实时与客户线索、待审核和已拒绝数据去重。
    </p>
    <div style={{display:"flex",gap:12,margin:"28px 0"}}>
      <button onClick={() => runImport(false)} disabled={running} style={{border:"1px solid #cfc8bc",borderRadius:10,padding:"13px 22px",background:"white",fontWeight:700,cursor:"pointer"}}>
        {running ? "正在处理……" : "只检查，不写入"}
      </button>
      <button onClick={() => runImport(true)} disabled={running || !result || result.newCount === 0} style={{border:0,borderRadius:10,padding:"13px 22px",background:"#17382c",color:"white",fontWeight:700,cursor:"pointer"}}>
        导入确认的新线索
      </button>
      <Link href="/lead-intelligence?reviewStatus=pending#review-center" style={{border:"1px solid #cfc8bc",borderRadius:10,padding:"13px 22px"}}>查看待审核列表</Link>
    </div>
    {result && <section style={{background:"#f6f4ef",borderRadius:14,padding:22,lineHeight:1.7}}>
      {result.error ? <p style={{color:"#b42318"}}>{result.error}</p> : <>
        <p><strong>核实：</strong>{result.reviewed ?? 0} 家；<strong>可新增：</strong>{result.newCount ?? result.inserted ?? 0} 家；<strong>已去重：</strong>{result.duplicates?.length ?? 0} 家。</p>
        {!!result.newCompanies?.length && <p><strong>准备新增：</strong>{result.newCompanies.join("、")}</p>}
        {result.inserted !== undefined && <p><strong>写入完成：</strong>{result.inserted} 家已进入待审核列表。</p>}
        {!!result.insertedCompanies?.length && <p>{result.insertedCompanies.join("、")}</p>}
      </>}
    </section>}
  </main>;
}
