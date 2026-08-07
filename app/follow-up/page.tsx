import Link from "next/link";
import { redirect } from "next/navigation";
import { FollowUpTabs } from "@/components/follow-up-tabs";
import { Header } from "@/components/header";
import { ManualFollowUpWorkspace, type FollowUpCustomerOption } from "@/components/manual-follow-up-workspace";
import { PhoneWorkspace } from "@/components/phone-workspace";
import { WhatsAppWorkspace } from "@/components/whatsapp-workspace";
import { isManualChannel, type ManualChannel } from "@/lib/channel-draft";
import { createClient } from "@/lib/supabase/server";
import { voiceConfig, voiceConfigured } from "@/lib/voice";
import { whatsappConfig, whatsappConfigured } from "@/lib/whatsapp";
import type { Customer, FollowUp, WhatsAppMessage } from "@/types/database";
import "./follow-up.css";
import "./integrations.css";

export const dynamic = "force-dynamic";

type Profile = { id: string; email: string | null; display_name: string | null };

function chinaDayStart(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - 8 * 3_600_000);
}

function channelClass(channel: string) {
  return channel.toLowerCase().replace(/[^a-z]/g, "") || "manual";
}

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; customer?: string }>;
}) {
  const params = await searchParams;
  const requestedChannel = (params.channel || "overview").toLowerCase();
  const channelNames: Record<string, ManualChannel> = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    phone: "Phone",
    linkedin: "LinkedIn",
  };
  const selectedChannel = channelNames[requestedChannel];
  const channel: "overview" | "WhatsAppBusiness" | ManualChannel = requestedChannel === "whatsapp-business"
    ? "WhatsAppBusiness"
    : selectedChannel && isManualChannel(selectedChannel)
      ? selectedChannel
      : "overview";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: customerData }, { data: followUpData }, { data: profileData }, { data: whatsappData }] = await Promise.all([
    supabase.from("customers").select("*").order("company", { ascending: true }),
    supabase.from("follow_ups").select("*").order("happened_at", { ascending: false }).limit(300),
    supabase.from("user_profiles").select("id,email,display_name"),
    supabase.from("whatsapp_messages").select("*").order("happened_at", { ascending: false }).limit(500),
  ]);
  const customers = (customerData ?? []) as Customer[];
  const followUps = (followUpData ?? []) as FollowUp[];
  const profiles = (profileData ?? []) as Profile[];
  const customerMap = new Map(customers.map((item) => [item.id, item]));
  const storedWhatsAppMessages = (whatsappData ?? []) as WhatsAppMessage[];
  const whatsappMessages = storedWhatsAppMessages.length ? storedWhatsAppMessages : followUps
    .filter((item) => item.channel === "WhatsApp")
    .map((item) => {
      const inbound = item.summary.startsWith("客户 WhatsApp 回复：");
      return {
        id: `follow-up-${item.id}`,
        meta_message_id: item.outcome?.match(/wa:([^\s·]+)/)?.[1] || `follow-up-${item.id}`,
        customer_id: item.customer_id,
        direction: inbound ? "inbound" : "outbound",
        from_number: inbound ? customerMap.get(item.customer_id)?.whatsapp || "" : whatsappConfig().displayNumber,
        to_number: inbound ? whatsappConfig().displayNumber : customerMap.get(item.customer_id)?.whatsapp || "",
        contact_name: null,
        message_type: "text",
        text_body: item.summary.replace(/^客户 WhatsApp 回复：|^发送 WhatsApp (?:模板|消息)：/, ""),
        media_id: null,
        media_mime_type: null,
        status: inbound ? "received" : "sent",
        error_text: null,
        raw_payload: {},
        sent_by: item.created_by,
        happened_at: item.happened_at,
        created_at: item.created_at,
        updated_at: item.created_at,
      } satisfies WhatsAppMessage;
    });
  const now = new Date();
  const whatsappWindowStart = now.getTime() - 24 * 3_600_000;
  const openWhatsAppWindowCustomerIds = Array.from(new Set(whatsappMessages
    .filter((item) => item.customer_id && item.direction === "inbound" && new Date(item.happened_at).getTime() >= whatsappWindowStart)
    .map((item) => item.customer_id!)));
  const profileMap = new Map(profiles.map((item) => [item.id, item.email || item.display_name || "未命名业务员"]));
  const priorityRank: Record<string, number> = { "A+": 0, A: 1, B: 2, C: 3, D: 4 };
  const todayStart = chinaDayStart(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const todayFollowUps = followUps.filter((item) => {
    const time = new Date(item.happened_at).getTime();
    return time >= todayStart.getTime() && time < tomorrowStart.getTime();
  });
  const dueCustomers = customers
    .filter((item) => item.next_follow_up_at && new Date(item.next_follow_up_at).getTime() <= now.getTime())
    .sort((left, right) =>
      (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99)
      || new Date(left.next_follow_up_at!).getTime() - new Date(right.next_follow_up_at!).getTime()
    );
  const options: FollowUpCustomerOption[] = customers
    .map((item) => ({
      id: item.id,
      company: item.company,
      priority: item.priority,
      country: item.country,
      customer_type: item.customer_type,
      contact_email: item.contact_email,
      whatsapp: item.whatsapp,
      website: item.website,
      notes: item.notes,
      next_follow_up_at: item.next_follow_up_at,
    }))
    .sort((left, right) =>
      (priorityRank[left.priority] ?? 99) - (priorityRank[right.priority] ?? 99)
      || left.company.localeCompare(right.company)
    );

  return <div className="shell"><Header/><main className="container followUpPage">
    <div className="pageHeader">
      <div><span className="pageKicker">CUSTOMER FOLLOW-UP</span><h2>客户跟进</h2><p>在一个工作区完成多渠道沟通、人工留痕和下一次任务安排。</p></div>
      <Link className="secondaryButton" href="/dashboard">查看今日优先任务</Link>
    </div>
    <FollowUpTabs active={channel === "overview" ? "overview" : channel === "WhatsAppBusiness" ? "whatsapp-business" : channel.toLowerCase()}/>

    {channel === "overview" ? <>
      <section className="followUpMetrics">
        <div className="card"><span>全部客户</span><strong>{customers.length}</strong><small>已审核进入客户线索</small></div>
        <div className="card"><span>今天及逾期</span><strong>{dueCustomers.length}</strong><small>下次跟进时间不晚于现在</small></div>
        <div className="card"><span>今日已跟进</span><strong>{todayFollowUps.length}</strong><small>全部渠道的已保存记录</small></div>
        <div className="card"><span>近期沟通记录</span><strong>{followUps.length}</strong><small>当前加载最近 300 条</small></div>
      </section>
      <div className="followUpOverviewGrid">
        <section className="card dueCustomerPanel">
          <div className="panelHeading"><div><h3>待处理客户</h3><p>高等级客户优先，同等级按逾期时间排序。</p></div><span>{dueCustomers.length} 位</span></div>
          <div className="dueCustomerList">{dueCustomers.slice(0, 30).map((customer) => <article key={customer.id}>
            <span className="priorityBadge">{customer.priority}</span>
            <div><strong>{customer.company}</strong><p>{[customer.country, customer.customer_type].filter(Boolean).join(" · ") || "客户背景待补充"}</p></div>
            <div className="dueMeta"><span>{new Date(customer.next_follow_up_at!).toLocaleDateString("zh-CN")}</span><Link href={`/follow-up?channel=whatsapp&customer=${customer.id}`}>开始跟进</Link></div>
          </article>)}{!dueCustomers.length && <p className="followUpEmpty">目前没有到期或逾期客户。</p>}</div>
        </section>
        <section className="card unifiedTimeline">
          <div className="panelHeading"><div><h3>统一沟通时间线</h3><p>邮件与人工渠道都汇总在这里。</p></div><span>最近 {Math.min(followUps.length, 100)} 条</span></div>
          <div className="followUpTimeline">{followUps.slice(0, 100).map((item) => {
            const customer = customerMap.get(item.customer_id);
            return <article key={item.id}>
              <span className={`channelDot ${channelClass(item.channel)}`}/>
              <div><div className="timelineHeading"><strong>{customer?.company || "未知客户"}</strong><span>{item.channel}</span></div><p>{item.summary}</p><small>{new Date(item.happened_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {item.created_by ? profileMap.get(item.created_by) || "未知业务员" : auth.user?.email || "历史记录"}{item.outcome ? ` · ${item.outcome}` : ""}</small></div>
            </article>;
          })}{!followUps.length && <p className="followUpEmpty">还没有跟进记录。</p>}</div>
        </section>
      </div>
    </> : channel === "WhatsAppBusiness" ? <WhatsAppWorkspace
      customers={options}
      messages={whatsappMessages}
      configured={whatsappConfigured()}
      displayNumber={whatsappConfig().displayNumber}
      webhookUrl={`${process.env.NEXT_PUBLIC_APP_URL || "https://dress-crm.vercel.app"}/api/whatsapp/webhook`}
      openWindowCustomerIds={openWhatsAppWindowCustomerIds}
      initialCustomerId={params.customer}
    /> : channel === "Phone" ? <PhoneWorkspace
      customers={options}
      configured={voiceConfigured()}
      callerNumber={voiceConfig().callerNumber}
      initialCustomerId={params.customer}
    /> : <ManualFollowUpWorkspace channel={channel} customers={options} initialCustomerId={params.customer}/>}
  </main></div>;
}
