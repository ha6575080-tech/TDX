import type { Metadata } from "next";
import { Outfit, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import ChatBubble from "@/components/ChatBubble";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  display: "swap",
});

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