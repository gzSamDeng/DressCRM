"use client";

import {
  approveDiscoveredLead,
  rejectDiscoveredLead,
  restoreDiscoveredLead,
} from "@/app/actions";

type ReviewStatus = "pending" | "approved" | "rejected";

export function ReviewLeadActions({
  leadId,
  status,
  linkedCustomer,
}: {
  leadId: string;
  status: ReviewStatus;
  linkedCustomer: boolean;
}) {
  if (status === "approved") return <span>已批准</span>;

  if (status === "rejected") {
    return <form action={restoreDiscoveredLead.bind(null, leadId)}>
      <button className="restoreButton" type="submit">
        {linkedCustomer ? "恢复到客户线索" : "恢复到待审核"}
      </button>
    </form>;
  }

  return <div className="reviewActions">
    <form action={approveDiscoveredLead.bind(null, leadId)}>
      <button className="approveButton" type="submit">批准进入 CRM</button>
    </form>
    <form
      action={rejectDiscoveredLead.bind(null, leadId)}
      onSubmit={(event) => {
        if (!window.confirm("确认拒绝这条线索吗？拒绝后仍可在“已拒绝”中恢复。")) {
          event.preventDefault();
        }
      }}
    >
      <button className="rejectButton" type="submit">拒绝</button>
    </form>
  </div>;
}
