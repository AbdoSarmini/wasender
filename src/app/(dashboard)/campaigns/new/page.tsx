"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { apiFetch, ApiError } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface Device {
  id: string;
  name: string;
  status: string;
  runtime?: { status: string };
}
interface Template {
  id: string;
  name: string;
  content: string;
}
interface Group {
  id: string;
  name: string;
  _count: { contacts: number };
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [targetAll, setTargetAll] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [minDelay, setMinDelay] = useState(5);
  const [maxDelay, setMaxDelay] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [d, t, g] = await Promise.all([
        apiFetch<{ devices: Device[] }>("/api/devices"),
        apiFetch<{ templates: Template[] }>("/api/templates"),
        apiFetch<{ groups: Group[] }>("/api/groups"),
      ]);
      setDevices(d.devices);
      setTemplates(t.templates);
      setGroups(g.groups);
    })();
  }, []);

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  const audienceCount = targetAll
    ? groups.reduce((sum, g) => sum + g._count.contacts, 0)
    : groups.filter((g) => groupIds.includes(g.id)).reduce((sum, g) => sum + g._count.contacts, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const campaign = await apiFetch<{ campaign: { id: string } }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          deviceId,
          templateId,
          targetAll,
          groupIds,
          minDelay,
          maxDelay,
        }),
      });
      router.push(`/campaigns/${campaign.campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign");
      setSaving(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <div>
      <PageHeader title="New campaign" description="Set up a bulk WhatsApp message campaign." />

      <div className="p-8 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. August Promo Blast"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Send from device</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a device...</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id} disabled={d.runtime?.status !== "connected" && d.status !== "connected"}>
                  {d.name} {d.runtime?.status !== "connected" && d.status !== "connected" ? "(not connected)" : ""}
                </option>
              ))}
            </select>
            {devices.length === 0 && (
              <p className="text-xs text-red-500 mt-1">No devices yet — connect one from the Devices page first.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-3">{selectedTemplate.content}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Audience</label>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={targetAll}
                onChange={(e) => setTargetAll(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Send to all contacts
            </label>
            {!targetAll && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {groups.length === 0 && (
                  <p className="px-3 py-4 text-sm text-gray-500">No groups yet — add contacts and groups first.</p>
                )}
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={groupIds.includes(g.id)}
                        onChange={() => toggleGroup(g.id)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      {g.name}
                    </span>
                    <span className="text-gray-400">{g._count.contacts} contacts</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">Estimated recipients: {audienceCount}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min delay (seconds)</label>
              <input
                type="number"
                min={1}
                value={minDelay}
                onChange={(e) => setMinDelay(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max delay (seconds)</label>
              <input
                type="number"
                min={minDelay}
                value={maxDelay}
                onChange={(e) => setMaxDelay(parseInt(e.target.value, 10) || minDelay)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-4">
            A random delay between these values is applied between each message to reduce the risk of
            being flagged as spam.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            Create campaign
          </button>
        </form>
      </div>
    </div>
  );
}
