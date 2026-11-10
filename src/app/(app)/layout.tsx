import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { Shell, type NavItem } from "@/components/shell";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

const NAV: { href: string; label: Key; icon: NavItem["icon"]; permission?: Permission }[] = [
  { href: "/", label: "nav.dashboard", icon: "home" },
  { href: "/animals", label: "nav.animals", icon: "animals" },
  { href: "/calendar", label: "nav.calendar", icon: "calendar" },
  { href: "/people", label: "nav.people", icon: "people" },
  { href: "/adoptions", label: "nav.adoptions", icon: "adoptions" },
  { href: "/visibility", label: "nav.visibility", icon: "visibility" },
  { href: "/reports", label: "nav.reports", icon: "reports" },
  { href: "/review", label: "nav.review", icon: "review", permission: "review:manage" },
  { href: "/admin/lists", label: "nav.lists", icon: "lists", permission: "lists:manage" },
  { href: "/admin/users", label: "nav.users", icon: "users", permission: "users:manage" },
  { href: "/admin/audit", label: "nav.audit", icon: "audit", permission: "audit:view" },
  { href: "/admin/privacy", label: "nav.privacy", icon: "privacy", permission: "privacy:manage" },
  { href: "/account", label: "nav.account", icon: "account" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser({ allowPasswordChange: true });
  const { t } = await getI18n();
  const items = NAV.filter((n) => !n.permission || can(user, n.permission)).map((n) => ({ href: n.href, label: t(n.label), icon: n.icon }));
  return (
    <Shell
      items={items}
      userName={user.name}
      appName={t("app.name")}
      logout={logout}
      labels={{ search: t("search.placeholder"), noResults: t("search.none"), more: t("nav.more"), logout: t("nav.logout"), close: t("common.close") }}
    >
      {children}
    </Shell>
  );
}
