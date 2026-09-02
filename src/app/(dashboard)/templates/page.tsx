"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { useDialogs } from "@/components/DialogProvider";
import { apiFetch, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { Plus, FileText, Trash2, Pencil, Paperclip, X, Loader2 } from "lucide-react";

interface Template {
  id: string;
  name: string;
  content: string;
  mediaPath: string | null;
  mediaName: string | null;
  mediaMime: string | null;
  updatedAt: string;
}

export default function TemplatesPage() {
  const { t } = useI18n();
  const { confirm, notify } = useDialogs();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<{ templates: Template[] }>("/api/templates");
    setTemplates(data.templates);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setContent("");
    setMediaFile(null);
    setRemoveMedia(false);
    setError("");
    setShowModal(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setContent(t.content);
    setMediaFile(null);
    setRemoveMedia(false);
    setError("");
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("content", content);
      if (mediaFile) form.set("media", mediaFile);
      if (removeMedia) form.set("removeMedia", "true");

      if (editing) {
        await apiFetch(`/api/templates/${editing.id}`, { method: "PATCH", body: form });
      } else {
        await apiFetch("/api/templates", { method: "POST", body: form });
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.templates.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm(t.templates.deleteConfirm))) return;
    try {
      await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t.templates.deleteFailed);
    }
  }

  return (
    <div>
      <PageHeader
        title={t.templates.title}
        description={t.templates.description}
        action={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700 transition"
          >
            <Plus size={16} /> {t.templates.newTemplate}
          </button>
        }
      />

      <div className="p-8">
        {!loading && templates.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <FileText className="mx-auto text-gray-300" size={40} />
            <p className="mt-3 text-gray-500">{t.templates.noTemplatesYet}</p>
            <button onClick={openCreate} className="mt-4 text-brand-600 font-medium text-sm hover:text-brand-700">
              {t.templates.createFirstTemplate}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-brand-600">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap flex-1">{t.content}</p>
              {t.mediaPath && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 rounded-lg px-2 py-1 w-fit">
                  <Paperclip size={12} /> {t.mediaName}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t.templates.editTemplate : t.templates.newTemplate}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.templateName}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              placeholder={t.templates.templateNamePlaceholder}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.message}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={5}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
              placeholder={"Hi {{name}}, thanks for..."}
            />
            <p className="text-xs text-gray-400 mt-1">{t.templates.variableHint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.templates.attachment}</label>
            {editing?.mediaPath && !mediaFile && !removeMedia ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5 text-gray-700 truncate">
                  <Paperclip size={14} /> {editing.mediaName}
                </span>
                <button type="button" onClick={() => setRemoveMedia(true)} className="text-red-500 hover:text-red-700">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,application/pdf"
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            {editing ? t.campaignForm.saveChanges : t.templates.createTemplate}
          </button>
        </form>
      </Modal>
    </div>
  );
}
