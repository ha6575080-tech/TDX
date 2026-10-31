import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import ChatBubble from "@/components/ChatBubble";
import { PUBLIC_SIGNUP_ENABLED } from "@/lib/pilot-mode";

// Offline-safe font fallback — avoids Google Fonts network fetch during build
// In production with network, next/font/google can be re-enabled by restoring the original file (layout.tsx.offline.bak)
const outfit = { variable: "--font-outfit" } as const;
const notoNastaliqUrdu = { variable: "--font-urdu" } as const;

export const metadata: Metadata = {
  title: "TDX — Investment Platform",
  description: PUBLIC_SIGNUP_ENABLED ? "Secure, transparent investment packages." : "TDX private pilot. Invitation-only access.",
  robots: PUBLIC_SIGNUP_ENABLED ? undefined : { index: false, follow: false },
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
