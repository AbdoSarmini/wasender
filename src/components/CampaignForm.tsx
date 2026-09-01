"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { parseContactsCsv, type ParsedContactRow } from "@/lib/csv-contacts";
import { useI18n } from "@/lib/i18n/context";
import Modal from "@/components/Modal";
import { ChevronDown, Download, Loader2, Plus, Search, Upload, X } from "lucide-react";

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
interface Contact {
  id: string;
  name: string;
  phone: string;
}

export interface CampaignFormInitial {
  name: string;
  deviceId: string;
  templateId: string;
  targetAll: boolean;
  groupIds: string[];
  contacts: Contact[];
  csvRows: ParsedContactRow[];
  minDelay: number;
  maxDelay: number;
  scheduledAt?: string | null;
}

const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

interface Props {
  campaignId?: string;
  initial?: CampaignFormInitial;
  submitLabel?: string;
}

export default function CampaignForm({ campaignId, initial, submitLabel }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const [name, setName] = useState(initial?.name ?? "");
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? "");
  const [templateId, setTemplateId] = useState(initial?.templateId ?? "");
  const [targetAll, setTargetAll] = useState(initial?.targetAll ?? false);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>(initial?.contacts ?? []);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [audienceCount, setAudienceCount] = useState(0);
  const [csvFileName, setCsvFileName] = useState(
    initial && initial.csvRows.length > 0 ? t.campaignForm.recipientsFromPreviousUpload(initial.csvRows.length) : ""
  );
  const [csvRows, setCsvRows] = useState<ParsedContactRow[]>(initial?.csvRows ?? []);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [csvError, setCsvError] = useState("");
  const [saveCsvToContacts, setSaveCsvToContacts] = useState(false);
  const [saveCsvGroupChoice, setSaveCsvGroupChoice] = useState("");
  const [saveCsvNewGroupName, setSaveCsvNewGroupName] = useState("");
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [minDelay, setMinDelay] = useState(initial?.minDelay ?? 5);
  const [maxDelay, setMaxDelay] = useState(initial?.maxDelay ?? 15);
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(initial?.scheduledAt));
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    initial?.scheduledAt ? toLocalInputValue(new Date(initial.scheduledAt)) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [newTemplateMedia, setNewTemplateMedia] = useState<File | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState("");

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.trim().toLowerCase())
  );
  const selectedGroups = groups.filter((g) => groupIds.includes(g.id));

  function toggleContact(c: Contact) {
    setSelectedContacts((prev) =>
      prev.some((p) => p.id === c.id) ? prev.filter((p) => p.id !== c.id) : [...prev, c]
    );
  }

  useEffect(() => {
    if (!contactSearch.trim()) {
      setContactResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearchingContacts(true);
      try {
        const data = await apiFetch<{ contacts: Contact[] }>(
          `/api/contacts?search=${encodeURIComponent(contactSearch.trim())}&pageSize=20`
        );
        setContactResults(data.contacts);
      } finally {
        setSearchingContacts(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [contactSearch]);

  useEffect(() => {
    if (targetAll) {
      setAudienceCount(groups.reduce((sum, g) => sum + g._count.contacts, 0));
      return;
    }
    if (groupIds.length === 0 && selectedContacts.length === 0 && csvRows.length === 0) {
      setAudienceCount(0);
      return;
    }
    const handle = setTimeout(async () => {
      const data = await apiFetch<{ count: number }>("/api/campaigns/audience-preview", {
        method: "POST",
        body: JSON.stringify({
          targetAll,
          groupIds,
          contactIds: selectedContacts.map((c) => c.id),
          csvPhones: csvRows.map((r) => r.phone),
        }),
      });
      setAudienceCount(data.count);
    }, 250);
    return () => clearTimeout(handle);
  }, [targetAll, groupIds, selectedContacts, csvRows, groups]);

  async function handleCsvFile(file: File | null) {
    setCsvError("");
    if (!file) {
      setCsvFileName("");
      setCsvRows([]);
      setCsvSkipped(0);
      return;
    }
    try {
      const text = await file.text();
      const result = parseContactsCsv(text);
      setCsvFileName(file.name);
      setCsvRows(result.rows);
      setCsvSkipped(result.skipped);
    } catch (err) {
      setCsvFileName("");
      setCsvRows([]);
      setCsvSkipped(0);
      setCsvError(err instanceof Error ? err.message : t.campaignForm.csvParseFailed);
    }
  }

  function openCreateTemplate() {
    setNewTemplateName("");
    setNewTemplateContent("");
    setNewTemplateMedia(null);
    setTemplateError("");
    setShowTemplateModal(true);
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    setTemplateError("");
    setCreatingTemplate(true);
    try {
      const form = new FormData();
      form.set("name", newTemplateName);
      form.set("content", newTemplateContent);
      if (newTemplateMedia) form.set("media", newTemplateMedia);
      const data = await apiFetch<{ template: Template }>("/api/templates", { method: "POST", body: form });
      setTemplates((prev) => [...prev, data.template]);
      setTemplateId(data.template.id);
      setShowTemplateModal(false);
    } catch (err) {
      setTemplateError(err instanceof ApiError ? err.message : t.templates.saveFailed);
    } finally {
      setCreatingTemplate(false);
    }
  }

  function handleDownloadSampleCsv() {
    const csv = "name,phone\nJohn Doe,+1234567890\nJane Smith,+1987654321\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearCsv() {
    setCsvFileName("");
    setCsvRows([]);
    setCsvSkipped(0);
    setCsvError("");
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let scheduledAt: string | null = null;
    if (scheduleEnabled) {
      if (!scheduledAtLocal) {
        setError(t.campaignForm.chooseScheduleDateTime);
        return;
      }
      const parsed = new Date(scheduledAtLocal);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        setError(t.campaignForm.scheduleMustBeFuture);
        return;
      }
      scheduledAt = parsed.toISOString();
    }

    setSaving(true);
    try {
      const payload = {
        name,
        deviceId,
        templateId,
        targetAll,
        groupIds,
        contactIds: selectedContacts.map((c) => c.id),
        csvContacts: csvRows,
        saveToContacts: saveCsvToContacts,
        saveToContactsGroupId: saveCsvToContacts && !saveCsvNewGroupName.trim() ? saveCsvGroupChoice || null : null,
        saveToContactsGroupName: saveCsvToContacts ? saveCsvNewGroupName.trim() || null : null,
        minDelay,
        maxDelay,
        scheduledAt,
      };
      const campaign = campaignId
        ? await apiFetch<{ campaign: { id: string } }>(`/api/campaigns/${campaignId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ campaign: { id: string } }>("/api/campaigns", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      router.push(`/campaigns/${campaign.campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.campaignForm.saveFailed);
      setSaving(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <div className="p-8 max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl border border-gray-100 shadow-xs p-6">
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.campaignForm.campaignName}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t.campaignForm.campaignNamePlaceholder}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.campaignForm.sendFromDevice}</label>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t.campaignForm.selectDevice}</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id} disabled={d.runtime?.status !== "connected" && d.status !== "connected"}>
                {d.name} {d.runtime?.status !== "connected" && d.status !== "connected" ? t.campaignForm.notConnected : ""}
              </option>
            ))}
          </select>
          {devices.length === 0 && (
            <p className="text-xs text-red-500 mt-1">{t.campaignForm.noDevicesYet}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">{t.campaignForm.messageTemplate}</label>
            <button
              type="button"
              onClick={openCreateTemplate}
              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus size={12} /> {t.templates.newTemplate}
            </button>
          </div>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t.campaignForm.selectTemplate}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          {selectedTemplate && (
            <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap line-clamp-3">{selectedTemplate.content}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.campaignForm.audience}</label>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <input
              type="checkbox"
              checked={targetAll}
              onChange={(e) => setTargetAll(e.target.checked)}
              className="rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            {t.campaignForm.sendToAllContacts}
          </label>
          {!targetAll && (
            <div className="space-y-3">
              <div ref={groupDropdownRef} className="relative">
                <p className="text-xs font-medium text-gray-500 mb-1">{t.campaignForm.groups}</p>
                <button
                  type="button"
                  onClick={() => setGroupDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-left focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                >
                  <span className={selectedGroups.length === 0 ? "text-gray-400" : "text-gray-700"}>
                    {selectedGroups.length === 0
                      ? t.campaignForm.selectGroups
                      : t.campaignForm.groupsSelected(selectedGroups.length)}
                  </span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>

                {groupDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="relative p-2 border-b border-gray-100">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                      <input
                        autoFocus
                        value={groupSearch}
                        onChange={(e) => setGroupSearch(e.target.value)}
                        placeholder={t.campaignForm.searchGroups}
                        className="w-full pl-7 pr-3 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {groups.length === 0 && (
                        <p className="px-3 py-4 text-sm text-gray-500">{t.campaignForm.noGroupsYet}</p>
                      )}
                      {groups.length > 0 && filteredGroups.length === 0 && (
                        <p className="px-3 py-4 text-sm text-gray-500">{t.campaignForm.noMatchingGroups}</p>
                      )}
                      {filteredGroups.map((g) => (
                        <label key={g.id} className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={groupIds.includes(g.id)}
                              onChange={() => toggleGroup(g.id)}
                              className="rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            {g.name}
                          </span>
                          <span className="text-gray-400">{t.campaignForm.contactsCount(g._count.contacts)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {selectedGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedGroups.map((g) => (
                      <span
                        key={g.id}
                        className="flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium pl-2 pr-1 py-1 rounded-full"
                      >
                        {g.name}
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.id)}
                          className="hover:bg-brand-100 rounded-full p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">{t.campaignForm.individualContacts}</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder={t.campaignForm.searchContacts}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                {contactSearch.trim() && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto mt-2">
                    {searchingContacts && <p className="px-3 py-3 text-sm text-gray-400">{t.campaignForm.searching}</p>}
                    {!searchingContacts && contactResults.length === 0 && (
                      <p className="px-3 py-3 text-sm text-gray-500">{t.campaignForm.noMatchingContacts}</p>
                    )}
                    {!searchingContacts &&
                      contactResults.map((c) => (
                        <label key={c.id} className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedContacts.some((p) => p.id === c.id)}
                              onChange={() => toggleContact(c)}
                              className="rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            {c.name}
                          </span>
                          <span className="text-gray-400">+{c.phone}</span>
                        </label>
                      ))}
                  </div>
                )}
                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedContacts.map((c) => (
                      <span
                        key={c.id}
                        className="flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-medium pl-2 pr-1 py-1 rounded-full"
                      >
                        {c.name}
                        <button
                          type="button"
                          onClick={() => toggleContact(c)}
                          className="hover:bg-brand-100 rounded-full p-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500">{t.campaignForm.uploadCsv}</p>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Download size={12} /> {t.contacts.sampleCsv}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {t.campaignForm.uploadCsvHintPrefix} <code>name</code> {t.campaignForm.uploadCsvHintAnd}{" "}
                  <code>phone</code>
                  {t.campaignForm.uploadCsvHintSuffix}
                </p>
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  id="campaign-csv-input"
                />
                {!csvFileName ? (
                  <label
                    htmlFor="campaign-csv-input"
                    className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-lg py-4 text-sm text-gray-500 cursor-pointer hover:bg-gray-50"
                  >
                    <Upload size={14} />
                    {t.campaignForm.chooseCsvFile}
                  </label>
                ) : (
                  <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                    <div className="text-sm">
                      <p className="text-gray-700 font-medium">{csvFileName}</p>
                      <p className="text-gray-500 text-xs">
                        {t.campaignForm.recipientsFound(csvRows.length)}
                        {csvSkipped > 0 ? t.campaignForm.skippedSuffix(csvSkipped) : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearCsv}
                      className="hover:bg-gray-100 rounded-full p-1 text-gray-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                {csvError && <p className="text-xs text-red-600 mt-1">{csvError}</p>}
                {csvRows.length > 0 && (
                  <div className="mt-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={saveCsvToContacts}
                        onChange={(e) => setSaveCsvToContacts(e.target.checked)}
                        className="rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      {t.campaignForm.alsoSaveToContacts}
                    </label>
                    {saveCsvToContacts && (
                      <div className="mt-2 pl-6 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            {t.contacts.assignExistingGroup}
                          </label>
                          <select
                            value={saveCsvGroupChoice}
                            onChange={(e) => {
                              setSaveCsvGroupChoice(e.target.value);
                              setSaveCsvNewGroupName("");
                            }}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
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
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            {t.contacts.orCreateNewGroup}
                          </label>
                          <input
                            value={saveCsvNewGroupName}
                            onChange={(e) => {
                              setSaveCsvNewGroupName(e.target.value);
                              if (e.target.value) setSaveCsvGroupChoice("");
                            }}
                            placeholder={t.contacts.newGroupPlaceholder}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">{t.campaignForm.estimatedRecipients(audienceCount)}</p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="rounded-sm border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            {t.campaignForm.scheduleForLater}
          </label>
          {scheduleEnabled && (
            <div>
              <input
                type="datetime-local"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                required={scheduleEnabled}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t.campaignForm.scheduleHint(userTimeZone)}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.campaignForm.minDelay}</label>
            <input
              type="number"
              min={1}
              value={minDelay}
              onChange={(e) => setMinDelay(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.campaignForm.maxDelay}</label>
            <input
              type="number"
              min={minDelay}
              value={maxDelay}
              onChange={(e) => setMaxDelay(parseInt(e.target.value, 10) || minDelay)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-4">{t.campaignForm.delayHint}</p>

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="animate-spin" size={16} />}
          {submitLabel ?? (campaignId ? t.campaignForm.saveChanges : t.campaignForm.createCampaign)}
        </button>
      </form>

      <Modal open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title={t.templates.newTemplate}>
        <form onSubmit={handleCreateTemplate} className="space-y-4">
          {templateError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{templateError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.templateName}</label>
            <input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              placeholder={t.templates.templateNamePlaceholder}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.message}</label>
            <textarea
              value={newTemplateContent}
              onChange={(e) => setNewTemplateContent(e.target.value)}
              required
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              placeholder={"Hi {{name}}, thanks for..."}
            />
            <p className="text-xs text-gray-400 mt-1">{t.templates.variableHint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.attachment}</label>
            <input
              type="file"
              accept="image/*,video/*,application/pdf"
              onChange={(e) => setNewTemplateMedia(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={creatingTemplate}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {creatingTemplate && <Loader2 className="animate-spin" size={16} />}
            {t.templates.createTemplate}
          </button>
        </form>
      </Modal>
    </div>
  );
}
