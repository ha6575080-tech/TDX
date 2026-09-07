import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import ChatBubble from "@/components/ChatBubble";

// Offline-safe font fallback — avoids Google Fonts network fetch during build
// In production with network, next/font/google can be re-enabled by restoring the original file (layout.tsx.offline.bak)
const outfit = { variable: "--font-outfit" } as const;
const notoNastaliqUrdu = { variable: "--font-urdu" } as const;

export const metadata: Metadata = {
  title: "TDX — Investment Platform",
  description: "Secure, transparent investment packages.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ur"
      dir="rtl"
      className={`${outfit.variable} ${notoNastaliqUrdu.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider>
          {children}
          <ChatBubble />
        </I18nProvider>
      </body>
    </html>
  );
}
