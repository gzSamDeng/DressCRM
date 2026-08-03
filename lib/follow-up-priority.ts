import type { Customer, FollowUp } from "@/types/database";

export const coldCadenceDays: Record<string, number> = { "A+": 10, A: 21, B: 30, C: 45, D: 90 };
export const engagedCadenceDays: Record<string, number> = { "A+": 3, A: 5, B: 7, C: 10, D: 14 };

const replyOutcomes = ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"];
const stoppedOutcomes = ["明确拒绝", "退订", "联系方式无效"];

export type CustomerSignal = {
  id: string;
  customer_id: string;
  title: string;
  summary: string | null;
  source_url: string;
  signal_type: string;
  relevance_score: number;
  published_at: string | null;
  created_at: string;
};

export type FollowUpRecommendation = {
  customer: Customer;
  lastFollowUp: FollowUp | null;
  latestSignal: CustomerSignal | null;
  dueAt: Date;
  overdueDays: number;
  score: number;
  reason: string;
  cadenceDays: number;
  hasReplied: boolean;
};

export function buildFollowUpRecommendations(
  customers: Customer[],
  followUps: FollowUp[],
  signals: CustomerSignal[],
  now = new Date(),
) {
  const priorityWeight: Record<string, number> = { "A+": 45, A: 36, B: 24, C: 12, D: 4 };
  return customers.map((customer): FollowUpRecommendation | null => {
    const history = followUps
      .filter((item) => item.customer_id === customer.id)
      .sort((a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime());
    const lastFollowUp = history[0] ?? null;
    if (lastFollowUp && stoppedOutcomes.includes(lastFollowUp.outcome ?? "")) return null;
    const hasReplied = history.some((item) => replyOutcomes.includes(item.outcome ?? ""));
    const cadenceDays = (hasReplied ? engagedCadenceDays : coldCadenceDays)[customer.priority] ?? 45;
    const base = lastFollowUp ? new Date(lastFollowUp.happened_at) : new Date(customer.created_at);
    const automaticDue = new Date(base.getTime() + cadenceDays * 86_400_000);
    const manualDue = customer.next_follow_up_at ? new Date(customer.next_follow_up_at) : null;
    const dueAt = manualDue && !Number.isNaN(manualDue.getTime()) ? manualDue : automaticDue;
    const overdueDays = Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
    const latestSignal = signals
      .filter((item) => item.customer_id === customer.id)
      .sort((a, b) => b.relevance_score - a.relevance_score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
    const signalBoost = latestSignal && new Date(latestSignal.created_at).getTime() > now.getTime() - 30 * 86_400_000
      ? Math.round(latestSignal.relevance_score * 0.25)
      : 0;
    const score = (priorityWeight[customer.priority] ?? 0)
      + Math.min(30, Math.max(0, overdueDays) * 2)
      + (hasReplied ? 22 : 0)
      + signalBoost;
    const reasons = [
      hasReplied ? "客户曾回复，采用较高跟进频率" : `未建立有效互动，按 ${cadenceDays} 天低频触达`,
      overdueDays > 0 ? `已逾期 ${overdueDays} 天` : overdueDays === 0 ? "今天到期" : `${Math.abs(overdueDays)} 天后到期`,
      latestSignal ? `发现商业信号：${latestSignal.title}` : "暂无近期商业信号",
    ];
    return { customer, lastFollowUp, latestSignal, dueAt, overdueDays, score, reason: reasons.join("；"), cadenceDays, hasReplied };
  }).filter((item): item is FollowUpRecommendation => Boolean(item)).sort((a, b) => b.score - a.score);
}
