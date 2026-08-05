"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { Play, Pause, Square, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Message {
  id: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  contact: { name: string; phone: string };
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  minDelay: number;
  maxDelay: number;
  sentCount: number;
  failedCount: number;
  totalCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  device: { name: string };
  template: { name: string; content: string };
  messages: Message[];
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ campaign: CampaignDetail }>(`/api/campaigns/${params.id}`);
      setCampaign(data.campaign);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onProgress = (payload: { campaignId: string }) => {
      if (payload.campaignId === params.id) load();
    };
    socket.on("campaign:progress", onProgress);
    return () => {
      socket.off("campaign:progress", onProgress);
    };
  }, [params.id, load]);

  async function handleAction(action: "start" | "pause" | "resume" | "stop") {
    try {
      await apiFetch(`/api/campaigns/${params.id}/${action}`, { method: "POST" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this campaign and its logs?")) return;
    await apiFetch(`/api/campaigns/${params.id}`, { method: "DELETE" });
    router.push("/campaigns");
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!campaign) return <div className="p-8 text-gray-500">Campaign not found.</div>;

  const progress =
    campaign.totalCount > 0
      ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.totalCount) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${campaign.device.name} · ${campaign.template.name}`}
        action={
          <div className="flex items-center gap-2">
            {(campaign.status === "draft" || campaign.status === "stopped") && (
              <button
                onClick={() => handleAction("start")}
                className="flex items-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100"
              >
                <Play size={14} /> Start
              </button>
            )}
            {campaign.status === "running" && (
              <button
                onClick={() => handleAction("pause")}
                className="flex items-center gap-1.5 text-sm font-medium bg-amber-50 text-amber-700 rounded-lg px-3 py-2 hover:bg-amber-100"
              >
                <Pause size={14} /> Pause
              </button>
            )}
            {campaign.status === "paused" && (
              <button
                onClick={() => handleAction("resume")}
                className="flex items-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100"
              >
                <Play size={14} /> Resume
              </button>
            )}
            {(campaign.status === "running" || campaign.status === "paused") && (
              <button
                onClick={() => handleAction("stop")}
                className="flex items-center gap-1.5 text-sm font-medium bg-red-50 text-red-700 rounded-lg px-3 py-2 hover:bg-red-100"
              >
                <Square size={14} /> Stop
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 text-gray-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Back to campaigns
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-3">
            <Badge status={campaign.status} />
            <span className="text-sm text-gray-500">
              {campaign.sentCount} sent · {campaign.failedCount} failed · {campaign.totalCount} total
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="bg-brand-600 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 text-sm">
            <div>
              <p className="text-gray-500">Delay</p>
              <p className="font-medium text-gray-900">
                {campaign.minDelay}–{campaign.maxDelay}s
              </p>
            </div>
            <div>
              <p className="text-gray-500">Started</p>
              <p className="font-medium text-gray-900">
                {campaign.startedAt ? new Date(campaign.startedAt).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Completed</p>
              <p className="font-medium text-gray-900">
                {campaign.completedAt ? new Date(campaign.completedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recipients (showing latest 200)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Contact</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 font-medium">Detail</th>
                <th className="text-left px-6 py-3 font-medium">Sent at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaign.messages.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{m.contact.name}</p>
                    <p className="text-gray-500">{m.contact.phone}</p>
                  </td>
                  <td className="px-6 py-3">
                    <Badge status={m.status} />
                  </td>
                  <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{m.error || "—"}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {m.sentAt ? new Date(m.sentAt).toLocaleString() : "—"}
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
