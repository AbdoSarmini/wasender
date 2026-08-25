"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Users,
  ScrollText,
  Smartphone,
  LogOut,
  UserCog,
  MapPin,
} from "lucide-react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n/context";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const NAV_ITEMS = [
    { href: "/", label: t.sidebar.overview, icon: LayoutDashboard },
    { href: "/campaigns", label: t.sidebar.campaigns, icon: MessageSquare },
    { href: "/templates", label: t.sidebar.templates, icon: FileText },
    { href: "/contacts", label: t.sidebar.contacts, icon: Users },
    { href: "/scraper", label: t.sidebar.scraper, icon: MapPin },
    { href: "/logs", label: t.sidebar.logs, icon: ScrollText },
    { href: "/devices", label: t.sidebar.devices, icon: Smartphone },
  ];

  const navItems = isAdmin
    ? [...NAV_ITEMS, { href: "/users", label: t.sidebar.users, icon: UserCog }]
    : NAV_ITEMS;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-gray-100 rtl:border-r-0 rtl:border-l flex flex-col">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <MessageSquare className="text-white" size={18} />
        </div>
        <span className="font-bold text-lg text-gray-900">{t.sidebar.appName}</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100 space-y-1">
        <LanguageSwitcher />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut size={18} />
          {t.sidebar.signOut}
        </button>
      </div>
    </aside>
  );
}
