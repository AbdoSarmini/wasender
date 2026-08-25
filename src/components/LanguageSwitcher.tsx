"use client";

import { useI18n } from "@/lib/i18n/context";
import { Languages } from "lucide-react";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
      title={t.sidebar.language}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
    >
      <Languages size={18} />
      {locale === "en" ? "العربية" : "English"}
    </button>
  );
}
