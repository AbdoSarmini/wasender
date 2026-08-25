"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { useI18n } from "@/lib/i18n/context";
import { Search } from "lucide-react";

interface LogEntry {
  id: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  contact: { name: string; phone: string } | null;
  rawName: string | null;
  rawPhone: string | null;
  campaign: { id: string; name: string };
}

export default function LogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    const data = await apiFetch<{ logs: LogEntry[]; total: number }>(`/api/logs?${params}`);
    setLogs(data.logs);
    setTotal(data.total);
    setLoading(false);
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on("campaign:progress", onUpdate);
    return () => {
      socket.off("campaign:progress", onUpdate);
    };
  }, [load]);

  return (
    <div>
      <PageHeader title={t.logs.title} description={t.logs.description} />

      <div className="p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.logs.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">{t.logs.allStatuses}</option>
            <option value="queued">{t.logs.queued}</option>
            <option value="sending">{t.logs.sending}</option>
            <option value="sent">{t.logs.sent}</option>
            <option value="failed">{t.logs.failed}</option>
            <option value="skipped">{t.logs.skipped}</option>
          </select>
          <span className="text-sm text-gray-500">{t.logs.total(total)}</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t.logs.contact}</th>
                <th className="text-left px-6 py-3 font-medium">{t.logs.campaign}</th>
                <th className="text-left px-6 py-3 font-medium">{t.logs.status}</th>
                <th className="text-left px-6 py-3 font-medium">{t.logs.detail}</th>
                <th className="text-left px-6 py-3 font-medium">{t.logs.time}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    {t.logs.noEntriesYet}
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{log.contact?.name ?? log.rawName ?? "—"}</p>
                    <p className="text-gray-500">{log.contact?.phone ?? log.rawPhone ?? ""}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{log.campaign.name}</td>
                  <td className="px-6 py-3">
                    <Badge status={log.status} />
                  </td>
                  <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{log.error || "—"}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(log.sentAt || log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
