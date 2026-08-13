import { coldCadenceDays, engagedCadenceDays } from "@/lib/follow-up-priority";
import type { Customer, FollowUp } from "@/types/database";

const DAY_MS = 86_400_000;
const replyOutcomes = ["已回复", "有兴趣", "要求报价", "要求样品", "采购计划明确"];

export type EmailCadence = {
  emailSent: boolean;
  emailDue: boolean;
  lastEmailAt: string | null;
  nextEmailAt: string | null;
  cadenceDays: number;
  hasReplied: boolean;
  overdueDays: number | null;
  timingStatus: "first_contact" | "due" | "today" | "upcoming" | "unknown";
};

function isEmailFollowUp(item: FollowUp) {
  return item.channel.toLowerCase().includes("email");
}

export function buildEmailCadence(
  customer: Customer,
  followUps: FollowUp[],
  now = new Date(),
): EmailCadence {
  const customerHistory = followUps.filter((item) => item.customer_id === customer.id);
  const emailHistory = customerHistory
    .filter(isEmailFollowUp)
    .sort((left, right) => new Date(right.happened_at).getTime() - new Date(left.happened_at).getTime());
  const lastEmail = emailHistory[0] ?? null;
  const legacySent = /已发送邮件|邮件已发送/i.test(customer.notes ?? "");
  const hasReplied = customerHistory.some((item) => replyOutcomes.includes(item.outcome ?? ""));
  const cadenceDays = (hasReplied ? engagedCadenceDays : coldCadenceDays)[customer.priority] ?? 45;

  if (!lastEmail) {
    if (legacySent) {
      return {
        emailSent: true,
        emailDue: false,
        lastEmailAt: null,
        nextEmailAt: null,
        cadenceDays,
        hasReplied,
        overdueDays: null,
        timingStatus: "unknown",
      };
    }
    return {
      emailSent: false,
      emailDue: true,
      lastEmailAt: null,
      nextEmailAt: null,
      cadenceDays,
      hasReplied,
      overdueDays: null,
      timingStatus: "first_contact",
    };
  }

  const lastEmailAt = new Date(lastEmail.happened_at);
  const nextEmailAt = new Date(lastEmailAt.getTime() + cadenceDays * DAY_MS);
  const difference = now.getTime() - nextEmailAt.getTime();
  const emailDue = difference >= 0;
  const overdueDays = emailDue
    ? Math.floor(difference / DAY_MS)
    : -Math.ceil(Math.abs(difference) / DAY_MS);

  return {
    emailSent: true,
    emailDue,
    lastEmailAt: lastEmailAt.toISOString(),
    nextEmailAt: nextEmailAt.toISOString(),
    cadenceDays,
    hasReplied,
    overdueDays,
    timingStatus: emailDue ? (overdueDays > 0 ? "due" : "today") : "upcoming",
  };
}
