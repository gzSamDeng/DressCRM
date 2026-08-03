"use client";

export function DeleteLeadForm({ action, company }: { action: () => Promise<void>; company: string }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`确定删除“${company}”吗？该线索及全部跟进记录将被永久删除。`)) {
          event.preventDefault();
        }
      }}
    >
      <button className="danger" type="submit">删除线索</button>
    </form>
  );
}
