"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { Plus, MessageSquare, Play, Pause, Square } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  sentCount: number;
  failedCount: number;
  totalCount: number;
  createdAt: string;
  device: { name: string; status: string };
  template: { name: string };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiFetch<{ campaigns: Campaign[] }>("/api/campaigns");
    setCampaigns(data.campaigns);
    setLoading(false);
  }, []);

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

  async function handleAction(id: string, action: "start" | "pause" | "resume" | "stop") {
    await apiFetch(`/api/campaigns/${id}/${action}`, { method: "POST" }).catch((e) => alert(e.message));
    load();
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Create and manage your WhatsApp bulk campaigns."
        action={
          <Link
            href="/campaigns/new"
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700 transition"
          >
            <Plus size={16} /> New campaign
          </Link>
        }
      />

      <div className="p-8">
        {!loading && campaigns.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <MessageSquare className="mx-auto text-gray-300" size={40} />
            <p className="mt-3 text-gray-500">No campaigns yet.</p>
            <Link href="/campaigns/new" className="mt-4 inline-block text-brand-600 font-medium text-sm hover:text-brand-700">
              Create your first campaign
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {campaigns.map((c) => {
            const progress = c.totalCount > 0 ? Math.round(((c.sentCount + c.failedCount) / c.totalCount) * 100) : 0;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      <Badge status={c.status} />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {c.device.name} · {c.template.name} · {c.sentCount}/{c.totalCount} sent
                      {c.failedCount > 0 ? `, ${c.failedCount} failed` : ""}
                    </p>
                    <div className="mt-3 w-full bg-gray-100 rounded-full h-2 max-w-md">
                      <div
                        className="bg-brand-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {(c.status === "draft" || c.status === "stopped") && (
                      <button
                        onClick={() => handleAction(c.id, "start")}
                        className="flex items-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100"
                      >
                        <Play size={14} /> Start
                      </button>
                    )}
                    {c.status === "running" && (
                      <button
                        onClick={() => handleAction(c.id, "pause")}
                        className="flex items-center gap-1.5 text-sm font-medium bg-amber-50 text-amber-700 rounded-lg px-3 py-2 hover:bg-amber-100"
                      >
                        <Pause size={14} /> Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button
                        onClick={() => handleAction(c.id, "resume")}
                        className="flex items-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100"
                      >
                        <Play size={14} /> Resume
                      </button>
                    )}
                    {(c.status === "running" || c.status === "paused") && (
                      <button
                        onClick={() => handleAction(c.id, "stop")}
                        className="flex items-center gap-1.5 text-sm font-medium bg-red-50 text-red-700 rounded-lg px-3 py-2 hover:bg-red-100"
                      >
                        <Square size={14} /> Stop
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
