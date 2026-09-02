"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { apiFetch, ApiError } from "@/lib/api";
import { getSocket } from "@/lib/socketClient";
import { useI18n } from "@/lib/i18n/context";
import { Plus, Smartphone, LogOut, Trash2, RefreshCw, Loader2 } from "lucide-react";

interface Device {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  runtime?: { status: string; qr?: string; phone?: string };
}

function effectiveStatus(d: Device) {
  return d.runtime?.status || d.status;
}

export default function DevicesPage() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [qrDeviceId, setQrDeviceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<{ devices: Device[] }>("/api/devices");
    setDevices(data.devices);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onState = (payload: { deviceId: string; status: string; qr?: string; phone?: string }) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === payload.deviceId ? { ...d, runtime: payload } : d))
      );
    };
    socket.on("device:state", onState);
    return () => {
      socket.off("device:state", onState);
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const data = await apiFetch<{ device: Device }>("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: newName || `WhatsApp ${devices.length + 1}` }),
      });
      setShowAdd(false);
      setNewName("");
      await load();
      setQrDeviceId(data.device.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.devices.addFailed);
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout(id: string) {
    await apiFetch(`/api/devices/${id}/logout`, { method: "POST" });
    load();
  }

  async function handleReconnect(id: string) {
    await apiFetch(`/api/devices/${id}/reconnect`, { method: "POST" });
    setQrDeviceId(id);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm(t.devices.deleteConfirm)) return;
    try {
      await apiFetch(`/api/devices/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t.devices.deleteFailed);
    }
  }

  const qrDevice = devices.find((d) => d.id === qrDeviceId);

  return (
    <div>
      <PageHeader
        title={t.devices.title}
        description={t.devices.description}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700 transition"
          >
            <Plus size={16} /> {t.devices.addDevice}
          </button>
        }
      />

      <div className="p-8">
        {!loading && devices.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <Smartphone className="mx-auto text-gray-300" size={40} />
            <p className="mt-3 text-gray-500">{t.devices.noDevicesYet}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 text-brand-600 font-medium text-sm hover:text-brand-700"
            >
              {t.devices.connectFirstDevice}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => {
            const status = effectiveStatus(d);
            const isConnecting = status === "initializing" || status === "qr" || status === "authenticated";
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Smartphone size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{d.name}</p>
                      <p className="text-sm text-gray-500">
                        {d.runtime?.phone || d.phone ? `+${d.runtime?.phone || d.phone}` : t.devices.notLinked}
                      </p>
                    </div>
                  </div>
                  <Badge status={status} />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {status === "connected" ? (
                    <button
                      onClick={() => handleLogout(d.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium border border-gray-200 rounded-lg py-2 hover:bg-gray-50"
                    >
                      <LogOut size={14} /> {t.devices.disconnect}
                    </button>
                  ) : isConnecting ? (
                    <button
                      onClick={() => setQrDeviceId(d.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg py-2 hover:bg-brand-100"
                    >
                      <Loader2 size={14} className="animate-spin" /> {t.devices.showQr}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReconnect(d.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium bg-brand-50 text-brand-700 rounded-lg py-2 hover:bg-brand-100"
                    >
                      <RefreshCw size={14} /> {t.devices.connect}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border-l-4 rtl:border-l-0 rtl:border-r-4 border-red-400 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">{t.devices.disclaimerTitle}</p>
          <p className="text-sm text-red-700 mt-1">{t.devices.disclaimerBody}</p>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t.devices.addDeviceTitle}>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.devices.deviceName}</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.devices.deviceNamePlaceholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {creating && <Loader2 className="animate-spin" size={16} />}
            {t.devices.continueToQrScan}
          </button>
        </form>
      </Modal>

      <Modal open={!!qrDevice} onClose={() => setQrDeviceId(null)} title={t.devices.connectTitle(qrDevice?.name || "")}>
        <div className="text-center">
          {qrDevice?.runtime?.status === "qr" && qrDevice.runtime.qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDevice.runtime.qr} alt="QR code" className="mx-auto w-56 h-56 rounded-lg border border-gray-100" />
              <p className="text-sm text-gray-600 mt-4">{t.devices.scanInstructions}</p>
            </>
          ) : qrDevice?.runtime?.status === "connected" ? (
            <div className="py-10">
              <p className="text-green-600 font-semibold">{t.devices.connectedSuccessfully}</p>
            </div>
          ) : qrDevice?.runtime?.status === "authenticated" ? (
            <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-sm">{t.devices.authenticating}</p>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="animate-spin" size={24} />
              <p className="text-sm">{t.devices.waitingForQr}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
