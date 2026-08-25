import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/constants";

export const metadata: Metadata = {
  title: "WaSender - WhatsApp Bulk Campaign Sender",
  description: "Send WhatsApp bulk campaigns with templates, contacts and scheduling.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get(LOCALE_COOKIE)?.value === "ar" ? "ar" : "en";

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
