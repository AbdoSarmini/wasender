"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { useI18n } from "@/lib/i18n/context";
import { ArrowLeft, Download, UserPlus, Square } from "lucide-react";

interface ScrapeJob {
  id: string;
  query: string;
  location: string;
  maxResults: number;
  status: string;
  resultCount: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface ScrapeResult {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  category: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
}

interface Group {
  id: string;
  name: string;
}

export default function ScrapeJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [jobData, resultsData] = await Promise.all([
        apiFetch<{ job: ScrapeJob }>(`/api/scrapes/${params.id}`),
        apiFetch<{ results: ScrapeResult[] }>(`/api/scrapes/${params.id}/results`),
      ]);
      setJob(jobData.job);
      setResults(resultsData.results);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onProgress = (payload: { jobId: string }) => {
      if (payload.jobId === params.id) load();
    };
    socket.on("scrape:progress", onProgress);
    return () => {
      socket.off("scrape:progress", onProgress);
    };
  }, [params.id, load]);

  async function handleStop() {
    await apiFetch(`/api/scrapes/${params.id}/stop`, { method: "POST" }).catch((e) => alert(e.message));
    load();
  }

  async function openImportModal() {
    setImportResult(null);
    const data = await apiFetch<{ groups: Group[] }>("/api/groups");
    setGroups(data.groups);
    setImportOpen(true);
  }

  async function handleImport() {
    setImporting(true);
    try {
      const data = await apiFetch<{ created: number; updated: number; skipped: number; total: number }>(
        `/api/scrapes/${params.id}/import-contacts`,
        { method: "POST", body: JSON.stringify({ groupId: groupId || null, groupName: groupName || null }) }
      );
      setImportResult(
        t.scraperDetail.importedSummary(data.total, data.created, data.updated, data.skipped)
      );
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t.scraperDetail.importFailed);
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">{t.scraperDetail.loading}</div>;
  if (!job) return <div className="p-8 text-gray-500">{t.scraperDetail.notFound}</div>;

  return (
    <div>
      <PageHeader
        title={`${job.query} · ${job.location}`}
        description={t.scraper.resultsOfUpTo(job.resultCount, job.maxResults)}
        action={
          <div className="flex items-center gap-2">
            {(job.status === "queued" || job.status === "running") && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 text-sm font-medium bg-red-50 text-red-700 rounded-lg px-3 py-2 hover:bg-red-100"
              >
                <Square size={14} /> {t.scraperDetail.stop}
              </button>
            )}
            <a
              href={`/api/scrapes/${job.id}/export`}
              className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 text-gray-600"
            >
              <Download size={14} /> {t.scraperDetail.exportCsv}
            </a>
            <button
              onClick={openImportModal}
              disabled={job.resultCount === 0}
              className="flex items-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100 disabled:opacity-50"
            >
              <UserPlus size={14} /> {t.scraperDetail.importToContacts}
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <Link href="/scraper" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} className="rtl:rotate-180" /> {t.scraperDetail.backToScraper}
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6">
          <div className="flex items-center justify-between">
            <Badge status={job.status} />
            {job.error && <span className="text-sm text-red-600">{job.error}</span>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{t.scraperDetail.results}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.name}</th>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.phone}</th>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.address}</th>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.category}</th>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.rating}</th>
                  <th className="text-left px-6 py-3 font-medium">{t.scraperDetail.website}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-6 py-3 text-gray-700 whitespace-nowrap">{r.phone || "—"}</td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{r.address || "—"}</td>
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{r.category || "—"}</td>
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                      {r.rating ? `${r.rating} (${r.reviewCount ?? 0})` : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">
                      {r.website ? (
                        <a href={r.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                          {r.website}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={t.scraperDetail.importToContacts}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t.scraperDetail.importModalDescription}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.scraperDetail.addToExistingGroup}</label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">{t.common.noGroup}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.scraperDetail.orCreateNewGroup}</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t.scraperDetail.newGroupPlaceholder}
              disabled={!!groupId}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>
          {importResult && <p className="text-sm text-gray-700">{importResult}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => router.push("/contacts")}
              className="text-sm font-medium text-gray-500 px-3 py-2 hover:text-gray-700"
            >
              {importResult ? t.scraperDetail.viewContacts : t.scraperDetail.cancel}
            </button>
            {!importResult && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
              >
                {importing ? t.scraperDetail.importing : t.scraperDetail.import}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
