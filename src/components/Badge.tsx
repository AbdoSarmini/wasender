import clsx from "clsx";
import { useI18n } from "@/lib/i18n/context";

const STYLES: Record<string, string> = {
  connected: "bg-green-50 text-green-700 ring-green-600/20",
  sent: "bg-green-50 text-green-700 ring-green-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  authenticated: "bg-blue-50 text-blue-700 ring-blue-600/20",
  running: "bg-blue-50 text-blue-700 ring-blue-600/20",
  queued: "bg-gray-50 text-gray-600 ring-gray-500/20",
  draft: "bg-gray-50 text-gray-600 ring-gray-500/20",
  scheduled: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  sending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  qr: "bg-amber-50 text-amber-700 ring-amber-600/20",
  initializing: "bg-amber-50 text-amber-700 ring-amber-600/20",
  paused: "bg-amber-50 text-amber-700 ring-amber-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  stopped: "bg-red-50 text-red-700 ring-red-600/20",
  skipped: "bg-gray-50 text-gray-500 ring-gray-500/20",
  disconnected: "bg-red-50 text-red-700 ring-red-600/20",
};

export default function Badge({ status }: { status: string }) {
  const { t } = useI18n();
  const label = (t.badge as Record<string, string>)[status] || status;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset capitalize",
        STYLES[status] || "bg-gray-50 text-gray-600 ring-gray-500/20"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
