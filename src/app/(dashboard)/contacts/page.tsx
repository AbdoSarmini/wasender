"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { Plus, Upload, Download, Users, Trash2, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 100;

interface Group {
  id: string;
  name: string;
  _count: { contacts: number };
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  groupId: string | null;
  group: Group | null;
}

export default function ContactsPage() {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addGroupId, setAddGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importGroupChoice, setImportGroupChoice] = useState("");
  const [importNewGroup, setImportNewGroup] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const [newGroupName, setNewGroupName] = useState("");

  const loadGroups = useCallback(async () => {
    const data = await apiFetch<{ groups: Group[] }>("/api/groups");
    setGroups(data.groups);
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (groupFilter !== "all") params.set("groupId", groupFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const data = await apiFetch<{ contacts: Contact[]; total: number }>(`/api/contacts?${params}`);
    setContacts(data.contacts);
    setTotal(data.total);
    setLoading(false);
  }, [search, groupFilter, page]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // A new search/filter invalidates the current page — jump back to page 1
  // rather than risk landing past the end of a now-smaller result set.
  useEffect(() => {
    setPage(1);
  }, [search, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If a delete (or a group removal) empties the current page, step back
  // instead of showing a blank page with contacts still waiting before it.
  useEffect(() => {
    if (!loading && contacts.length === 0 && page > 1) {
      setPage((p) => p - 1);
    }
  }, [loading, contacts.length, page]);

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiFetch("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ name: addName, phone: addPhone, groupId: addGroupId || null }),
      });
      setShowAdd(false);
      setAddName("");
      setAddPhone("");
      setAddGroupId("");
      loadContacts();
      loadGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.contacts.addFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) return;
    setError("");
    setImporting(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.set("file", importFile);
      if (importNewGroup.trim()) form.set("groupName", importNewGroup.trim());
      else if (importGroupChoice) form.set("groupId", importGroupChoice);

      const result = await apiFetch<{ created: number; updated: number; skipped: number }>(
        "/api/contacts/import",
        { method: "POST", body: form }
      );
      setImportResult(result);
      loadContacts();
      loadGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.contacts.importFailed);
    } finally {
      setImporting(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await apiFetch("/api/groups", { method: "POST", body: JSON.stringify({ name: newGroupName.trim() }) });
    setNewGroupName("");
    loadGroups();
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm(t.contacts.deleteGroupConfirm)) return;
    await apiFetch(`/api/groups/${id}`, { method: "DELETE" });
    loadGroups();
    loadContacts();
  }

  async function handleDeleteContact(id: string) {
    if (!confirm(t.contacts.deleteContactConfirm)) return;
    await apiFetch(`/api/contacts/${id}`, { method: "DELETE" });
    loadContacts();
  }

  function handleDownloadSample() {
    const csv = "name,phone\nJohn Doe,+1234567890\nJane Smith,+1987654321\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={t.contacts.title}
        description={t.contacts.description}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGroupModal(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              <Users size={16} /> {t.contacts.groups}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              <Upload size={16} /> {t.contacts.importCsv}
            </button>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              <Download size={16} /> {t.contacts.sampleCsv}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700"
            >
              <Plus size={16} /> {t.contacts.addContact}
            </button>
          </div>
        }
      />

      <div className="p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.contacts.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">{t.contacts.allGroups}</option>
            <option value="none">{t.contacts.ungrouped}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g._count.contacts})
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{t.contacts.totalContacts(total)}</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t.contacts.name}</th>
                <th className="text-left px-6 py-3 font-medium">{t.contacts.phone}</th>
                <th className="text-left px-6 py-3 font-medium">{t.contacts.group}</th>
                <th className="text-right px-6 py-3 font-medium">{t.contacts.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    {t.contacts.noContactsFound}
                  </td>
                </tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-3 text-gray-600">+{c.phone}</td>
                  <td className="px-6 py-3 text-gray-600">{c.group?.name || "—"}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDeleteContact(c.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{t.contacts.pageOf(page, totalPages)}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} className="rtl:rotate-180" /> {t.contacts.previous}
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.contacts.next} <ChevronRight size={14} className="rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t.contacts.addContactTitle}>
        <form onSubmit={handleAddContact} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.name}</label>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.phoneWithCode}</label>
            <input
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              required
              placeholder={t.contacts.phonePlaceholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.groupOptional}</label>
            <select
              value={addGroupId}
              onChange={(e) => setAddGroupId(e.target.value)}
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
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            {t.contacts.addContact}
          </button>
        </form>
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title={t.contacts.importTitle}>
        <form onSubmit={handleImport} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {importResult && (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              {t.contacts.importedSummary(importResult.created, importResult.updated, importResult.skipped)}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.csvFile}</label>
            <input
              type="file"
              accept=".csv"
              required
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium"
            />
            <p className="text-xs text-gray-400 mt-1">{t.contacts.csvFileHint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.assignExistingGroup}</label>
            <select
              value={importGroupChoice}
              onChange={(e) => {
                setImportGroupChoice(e.target.value);
                setImportNewGroup("");
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
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.contacts.orCreateNewGroup}</label>
            <input
              value={importNewGroup}
              onChange={(e) => setImportNewGroup(e.target.value)}
              placeholder={t.contacts.newGroupPlaceholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={importing}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {importing && <Loader2 className="animate-spin" size={16} />}
            {t.contacts.import}
          </button>
        </form>
      </Modal>

      <Modal open={showGroupModal} onClose={() => setShowGroupModal(false)} title={t.contacts.manageGroups}>
        <div className="space-y-4">
          <form onSubmit={handleCreateGroup} className="flex gap-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={t.contacts.newGroupName}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
            <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700">
              {t.common.add}
            </button>
          </form>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {groups.length === 0 && <p className="px-4 py-6 text-sm text-gray-500 text-center">{t.contacts.noGroupsYet}</p>}
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{g.name}</p>
                  <p className="text-xs text-gray-500">{t.campaignForm.contactsCount(g._count.contacts)}</p>
                </div>
                <button onClick={() => handleDeleteGroup(g.id)} className="text-gray-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
