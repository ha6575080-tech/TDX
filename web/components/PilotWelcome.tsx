"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui";

export default function PilotWelcome({ registration = false }: { registration?: boolean }) {
  const { lang } = useI18n();
  const urdu = lang === "ur";
  return (
    <main className="min-h-screen bg-base px-5 py-16 text-on-surface flex items-center justify-center">
      <section className="glass-panel w-full max-w-xl rounded-2xl p-7 sm:p-10 space-y-6">
        <p className="font-bold text-primary">TDX Investment</p>
        <h1 className="text-3xl font-bold">{urdu ? "نجی آزمائشی مرحلہ" : "Private pilot"}</h1>
        <p className="text-on-surface-variant leading-relaxed">{urdu ? "TDX اس وقت غیر تجارتی آزمائش کے مرحلے میں ہے۔ رسائی صرف دعوت کے ذریعے دی جاتی ہے۔ حقیقی رقم جمع نہ کریں۔" : "TDX is currently in a non-commercial testing phase. Access is by invitation. Do not send real payments during the pilot."}</p>
        {registration && <p role="status" className="text-sm text-on-surface-variant">{urdu ? "عوامی رجسٹریشن فی الحال بند ہے۔ دعوت کے لیے سپورٹ سے رابطہ کریں۔" : "Public registration is currently closed. Contact support to request an invitation."}</p>}
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary">{urdu ? "پائلٹ کھولیں" : "Open pilot"}</Link>
          <Link href="/login" className="rounded-xl border border-outline-variant px-5 py-3 font-semibold">{urdu ? "لاگ ان" : "Sign in"}</Link>
        </div>
        <p className="text-sm text-on-surface-variant">{urdu ? "سپورٹ" : "Support"}: <a href="tel:+923083958294" className="font-semibold text-primary" dir="ltr">0308-3958294</a></p>
        <LanguageToggle />
      </section>
    </main>
  );
}
