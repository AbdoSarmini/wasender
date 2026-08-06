"use client";

import { useEffect, useState } from "react";
import { Users, FileText, MessageSquare, Smartphone, Send, XCircle, TrendingUp, Zap } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";

interface Stats {
  totalContacts: number;
  totalTemplates: number;
  totalCampaigns: number;
  totalDevices: number;
  connectedDevices: number;
  activeCampaigns: number;
  sentToday: number;
  failedToday: number;
  totalSent: number;
  totalFailed: number;
  successRate: number;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    sentCount: number;
    failedCount: number;
    totalCount: number;
    device: { name: string };
    template: { name: string };
  }>;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  async function load() {
    const data = await apiFetch<Stats>("/api/stats");
    setStats(data);
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on("device:state", onUpdate);
    socket.on("campaign:progress", onUpdate);
    const interval = setInterval(load, 15000);
    return () => {
      socket.off("device:state", onUpdate);
      socket.off("campaign:progress", onUpdate);
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <PageHeader title="Overview" description="A snapshot of your WhatsApp campaign activity." />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Contacts" value={stats?.totalContacts ?? "—"} icon={Users} tone="brand" />
          <StatCard label="Templates" value={stats?.totalTemplates ?? "—"} icon={FileText} tone="brand" />
          <StatCard label="Campaigns" value={stats?.totalCampaigns ?? "—"} icon={MessageSquare} tone="brand" />
          <StatCard
            label="Connected devices"
            value={stats ? `${stats.connectedDevices}/${stats.totalDevices}` : "—"}
            icon={Smartphone}
            tone="brand"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sent today" value={stats?.sentToday ?? "—"} icon={Send} tone="green" />
          <StatCard label="Failed today" value={stats?.failedToday ?? "—"} icon={XCircle} tone="red" />
          <StatCard label="Success rate" value={stats ? `${stats.successRate}%` : "—"} icon={TrendingUp} tone="green" />
          <StatCard label="Active campaigns" value={stats?.activeCampaigns ?? "—"} icon={Zap} tone="amber" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent campaigns</h2>
            <Link href="/campaigns" className="text-sm text-brand-600 font-medium hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {stats?.recentCampaigns?.length === 0 && (
              <p className="px-6 py-8 text-sm text-gray-500 text-center">
                No campaigns yet.{" "}
                <Link href="/campaigns/new" className="text-brand-600 font-medium">
                  Create your first campaign
                </Link>
                .
              </p>
            )}
            {stats?.recentCampaigns?.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {c.device.name} · {c.template.name} · {c.sentCount}/{c.totalCount} sent
                    {c.failedCount > 0 ? `, ${c.failedCount} failed` : ""}
                  </p>
                </div>
                <Badge status={c.status} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
