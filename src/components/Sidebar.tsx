"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  Users,
  ScrollText,
  Smartphone,
  UserCog,
  MapPin,
  DatabaseBackup,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n/context";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Modal from "@/components/Modal";
import { ApiError } from "@/lib/api";

export default function Sidebar({ isAdmin = false, canBackup = false }: { isAdmin?: boolean; canBackup?: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [showBackup, setShowBackup] = useState(false);

  const NAV_ITEMS = [
    { href: "/", label: t.sidebar.overview, icon: LayoutDashboard },
    { href: "/campaigns", label: t.sidebar.campaigns, icon: MessageSquare },
    { href: "/templates", label: t.sidebar.templates, icon: FileText },
    { href: "/contacts", label: t.sidebar.contacts, icon: Users },
    { href: "/scraper", label: t.sidebar.scraper, icon: MapPin },
    { href: "/logs", label: t.sidebar.logs, icon: ScrollText },
    { href: "/devices", label: t.sidebar.devices, icon: Smartphone },
  ];

  const navItems = isAdmin ? [...NAV_ITEMS, { href: "/users", label: t.sidebar.users, icon: UserCog }] : NAV_ITEMS;

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
        {canBackup && (
          <button
            onClick={() => setShowBackup(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <DatabaseBackup size={18} />
            {t.backup.navLabel}
          </button>
        )}
        <LanguageSwitcher />
      </div>

      {canBackup && <BackupModal open={showBackup} onClose={() => setShowBackup(false)} />}
    </aside>
  );
}

function BackupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [error, setError] = useState("");

  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(data?.error || res.statusText, res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] || "wasender-backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.backup.downloadFailed);
    } finally {
      setDownloading(false);
    }
  }

  function handleChooseFile() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t.backup.invalidFile);
      return;
    }
    if (!window.confirm(t.backup.restoreConfirm)) return;

    setError("");
    setRestoring(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/restore", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(data?.error || res.statusText, res.status);
      setRestoreDone(true);
      if (data.restarting) {
        // The Electron shell restarts the server and reloads this window
        // automatically — nothing left to do here but wait for that.
      } else {
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err) {
      setRestoring(false);
      setError(err instanceof ApiError ? err.message : t.backup.restoreFailed);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t.backup.title}>
      {restoring ? (
        <div className="py-6 flex flex-col items-center gap-3 text-gray-600 text-center">
          <Loader2 className="animate-spin" size={24} />
          <p className="text-sm">{t.backup.restoring}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">{t.backup.description}</p>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {restoreDone && (
            <div className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{t.backup.restoring}</div>
          )}

          <div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
            >
              {downloading && <Loader2 className="animate-spin" size={16} />}
              {downloading ? t.backup.downloadingBackup : t.backup.downloadBackup}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm font-medium text-gray-900 mb-1">{t.backup.restoreTitle}</p>
            <p className="text-xs text-gray-500 mb-3">{t.backup.restoreWarning}</p>
            <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelected} className="hidden" />
            <button
              onClick={handleChooseFile}
              className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50"
            >
              {t.backup.chooseFile}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
