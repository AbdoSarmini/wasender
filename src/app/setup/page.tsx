"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/setup");
        const data = await res.json();
        if (!data.needsSetup) {
          router.replace("/login");
          return;
        }
      } catch {
        // If the check itself fails, still let the form render — the
        // POST below will reject cleanly if setup turns out to be done.
      }
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t.setup.passwordsDontMatch);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t.setup.setupFailed);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t.setup.somethingWrong);
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-brand-50 via-white to-brand-100 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30 mb-4">
            <MessageSquare className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t.setup.title}</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">{t.setup.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-6 space-y-4 border border-gray-100">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.setup.email}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.setup.password}</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-400 mt-1">{t.setup.passwordHint}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.setup.confirmPassword}</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white py-2.5 text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-60"
          >
            {loading && <Loader2 className="animate-spin" size={16} />}
            {t.setup.createAccount}
          </button>
        </form>
      </div>
    </div>
  );
}
