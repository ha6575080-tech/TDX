"use client";

import Link from "next/link";
import { Rocket, ShieldCheck, TrendingUp, Wallet, BarChart3 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GlassPanel, GlowButton, LanguageToggle } from "@/components/ui";

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-base text-on-surface flex flex-col overflow-x-hidden">
      {/* Top Navigation */}
      <nav className="hidden md:flex fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-md shadow-primary/10">
        <div className="flex justify-between items-center px-container-padding h-16 w-full max-w-7xl mx-auto">
          <div className="text-headline-lg font-bold text-primary">
            {t("appName")}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-label-md text-on-surface-variant hover:bg-surface-bright transition-colors px-4 py-2 rounded-lg"
            >
              {t("login")}
            </Link>
            <Link
              href="/register"
              className="text-label-md text-secondary font-bold hover:bg-surface-bright transition-colors px-4 py-2 rounded-lg"
            >
              {t("register")}
            </Link>
            <LanguageToggle />
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden flex justify-between items-center px-container-padding h-16 w-full bg-surface/80 backdrop-blur-xl fixed top-0 z-50 border-b border-outline-variant/30">
        <div className="text-headline-lg-mobile font-bold text-primary">
          {t("appName")}
        </div>
        <LanguageToggle />
      </header>

      {/* Main Content */}
      <main className="flex-grow relative w-full pb-24 md:pb-0 pt-16 md:pt-24">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="orb-glow bg-primary/20 w-96 h-96 top-20 left-10" />
          <div className="orb-glow bg-secondary/15 w-[500px] h-[500px] bottom-40 right-20" style={{ animationDelay: "-3s" }} />
          <div className="orb-glow bg-tertiary/10 w-80 h-80 top-1/2 left-1/3" style={{ animationDelay: "-7s" }} />
        </div>

        <div className="max-w-7xl mx-auto px-container-padding py-12 md:py-20 flex flex-col items-center text-center">
          <h1 className="text-headline-xl md:text-[64px] md:leading-[72px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary mb-6 max-w-4xl drop-shadow-[0_0_15px_rgba(208,255,130,0.3)]">
            {t("growYourFortune")}
          </h1>
          <p className="text-body-lg text-on-surface-variant max-w-2xl mb-12">
            {t("heroSubtitle")}
          </p>

          <Link href="/register">
            <GlowButton className="px-10 py-4 mb-20">
              {t("startEarning")}
              <Rocket className="w-5 h-5" />
            </GlowButton>
          </Link>

          {/* Trust Banner */}
          <GlassPanel className="w-full max-w-5xl rounded-2xl p-6 mb-20 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 text-on-surface-variant text-label-md uppercase tracking-widest">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {t("securePlatform")}
            </div>
            <div className="h-8 w-px bg-outline-variant hidden md:block" />
            <div className="flex items-center gap-2 text-secondary text-body-md">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              {t("livePayouts")}
            </div>
            <div className="h-8 w-px bg-outline-variant hidden md:block" />
            <div className="flex items-center gap-4 opacity-60">
              <Wallet className="w-8 h-8" />
              <BarChart3 className="w-8 h-8" />
              <TrendingUp className="w-8 h-8" />
            </div>
          </GlassPanel>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 px-container-padding bg-surface-container-lowest border-t border-outline-variant/20 flex flex-col items-center gap-4 text-center max-w-7xl mx-auto mb-20 md:mb-0">
        <div className="text-label-md text-secondary">{t("appName")}</div>
        <div className="flex gap-4">
          <a className="text-label-sm text-on-surface-variant hover:text-secondary transition-colors opacity-80 hover:opacity-100" href="#">
            Terms
          </a>
          <a className="text-label-sm text-on-surface-variant hover:text-secondary transition-colors opacity-80 hover:opacity-100" href="#">
            Privacy
          </a>
          <a className="text-label-sm text-on-surface-variant hover:text-secondary transition-colors opacity-80 hover:opacity-100" href="#">
            Support
          </a>
        </div>
        <div className="text-label-sm text-on-surface-variant opacity-60">
          © 2024 TDX Investment Corp. All Rights Reserved.
        </div>
      </footer>
    </main>
  );
}

