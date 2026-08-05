import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaSender - WhatsApp Bulk Campaign Sender",
  description: "Send WhatsApp bulk campaigns with templates, contacts and scheduling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
