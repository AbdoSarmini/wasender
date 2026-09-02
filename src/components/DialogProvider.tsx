"use client";

// Electron runs window.confirm()/alert() as a native, synchronous Chromium
// dialog. Closing it leaves the renderer's focus/input handling broken —
// every field in the window becomes unresponsive until reload. These
// in-page replacements avoid the native dialog entirely.

import { createContext, useCallback, useContext, useState } from "react";
import { useI18n } from "@/lib/i18n/context";

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface AlertState {
  message: string;
  resolve: () => void;
}

interface DialogContextValue {
  confirm: (message: string) => Promise<boolean>;
  notify: (message: string) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));
  }, []);

  const notify = useCallback((message: string) => {
    return new Promise<void>((resolve) => setAlertState({ message, resolve }));
  }, []);

  function closeConfirm(result: boolean) {
    confirmState?.resolve(result);
    setConfirmState(null);
  }

  function closeAlert() {
    alertState?.resolve();
    setAlertState(null);
  }

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {confirmState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => closeConfirm(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <p className="text-sm text-gray-800 whitespace-pre-line">{confirmState.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => closeConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                autoFocus
              >
                {t.common.ok}
              </button>
            </div>
          </div>
        </div>
      )}
      {alertState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40" onClick={closeAlert} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <p className="text-sm text-gray-800 whitespace-pre-line">{alertState.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeAlert}
                className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
                autoFocus
              >
                {t.common.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used within a DialogProvider");
  return ctx;
}
