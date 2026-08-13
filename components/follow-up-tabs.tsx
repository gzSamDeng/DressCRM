import Link from "next/link";

const tabs = [
  { key: "overview", label: "跟进总览", href: "/follow-up" },
  { key: "email", label: "邮件", href: "/email" },
  { key: "whatsapp", label: "WhatsApp 人工", href: "/follow-up?channel=whatsapp" },
  { key: "instagram", label: "Instagram", href: "/follow-up?channel=instagram" },
  { key: "whatsapp-business", label: "WhatsApp Business", href: "/follow-up?channel=whatsapp-business" },
  { key: "telegram", label: "Telegram", href: "/follow-up?channel=telegram" },
  { key: "phone", label: "电话", href: "/follow-up?channel=phone" },
  { key: "linkedin", label: "LinkedIn", href: "/follow-up?channel=linkedin" },
];

export function FollowUpTabs({ active }: { active: string }) {
  return <nav className="followUpTabs" aria-label="客户跟进渠道">
    {tabs.map((tab) => <Link
      key={tab.key}
      className={active === tab.key ? "active" : ""}
      aria-current={active === tab.key ? "page" : undefined}
      href={tab.href}
    >{tab.label}</Link>)}
  </nav>;
}
