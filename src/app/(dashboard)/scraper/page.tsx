"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import { useDialogs } from "@/components/DialogProvider";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { useI18n } from "@/lib/i18n/context";
import { MapPin, Search, Square, Trash2 } from "lucide-react";

interface ScrapeJob {
  id: string;
  query: string;
  language: string;
  maxResults: number;
  status: string;
  resultCount: number;
  error: string | null;
  createdAt: string;
}

export default function ScraperPage() {
  const { t } = useI18n();
  const { confirm, notify } = useDialogs();
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("ar");
  const [maxResults, setMaxResults] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<{ jobs: ScrapeJob[] }>("/api/scrapes");
    setJobs(data.jobs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on("scrape:progress", onUpdate);
    return () => {
      socket.off("scrape:progress", onUpdate);
    };
  }, [load]);

  const hasActiveJob = jobs.some((j) => j.status === "queued" || j.status === "running");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/scrapes", {
        method: "POST",
        body: JSON.stringify({ query, language, maxResults }),
      });
      setQuery("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.scraper.startFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop(id: string) {
    await apiFetch(`/api/scrapes/${id}/stop`, { method: "POST" }).catch((e) => notify(e.message));
    load();
  }

  async function handleDelete(id: string) {
    if (!(await confirm(t.scraper.deleteConfirm))) return;
    await apiFetch(`/api/scrapes/${id}`, { method: "DELETE" }).catch((e) => notify(e.message));
    load();
  }

  return (
    <div>
      <PageHeader
        title={t.scraper.title}
        description={t.scraper.description}
      />

      <div className="p-8 space-y-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.scraper.whatLookingFor}</label>
              <input
                required
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.scraper.whatLookingForPlaceholder}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.scraper.language}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="en">{t.scraper.languageEnglish}</option>
                <option value="ar">{t.scraper.languageArabic}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.scraper.maxResults}</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || hasActiveJob}
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700 transition disabled:opacity-50"
            title={hasActiveJob ? t.scraper.onlyOneJobAtATime : undefined}
          >
            <Search size={16} /> {submitting ? t.scraper.starting : t.scraper.startScrape}
          </button>
        </form>

        {!loading && jobs.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <MapPin className="mx-auto text-gray-300" size={40} />
            <p className="mt-3 text-gray-500">{t.scraper.noJobsYet}</p>
          </div>
        )}

        <div className="space-y-3">
          {jobs.map((j) => (
            <div key={j.id} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
              <div className="flex items-start justify-between gap-4">
                <Link href={`/scraper/${j.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{j.query}</p>
                    <Badge status={j.status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {t.scraper.resultsOfUpTo(j.resultCount, j.maxResults)}
                    {j.error ? ` · ${j.error}` : ""}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {(j.status === "queued" || j.status === "running") && (
                    <button
                      onClick={() => handleStop(j.id)}
                      className="flex items-center gap-1.5 text-sm font-medium bg-red-50 text-red-700 rounded-lg px-3 py-2 hover:bg-red-100"
                    >
                      <Square size={14} /> {t.scraperDetail.stop}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(j.id)}
                    className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 text-gray-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
