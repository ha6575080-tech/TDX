"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, ShieldCheck, TrendingUp, Wallet, BarChart3, Lock, EyeOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { GlassPanel, GlowButton, LanguageToggle } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_ACCOUNT } from "@/lib/investment";

export default function Home() {
  const { t } = useI18n();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    async function checkAuth() {
      try {
        // Guard: if env vars missing during offline build, treat as logged out
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          if (mounted) {
            setUser(null);
            setAuthLoading(false);
          }
          return;
        }
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (mounted) {
          setUser(data?.user ?? null);
          setAuthLoading(false);
        }

        // Subscribe to auth changes so login/logout updates UI without refresh
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          if (mounted) {
            setUser(session?.user ?? null);
          }
        });
        subscription = listener?.subscription;
      } catch {
        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      mounted = false;
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const isRegistered = !!user;

  return (
    <main className="min-h-screen bg-base text-on-surface flex flex-col overflow-x-hidden">
      {/* Top Navigation */}
      <nav className="hidden md:flex fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-md shadow-primary/10">
        <div className="flex justify-between items-center px-container-padding h-16 w-full max-w-7xl mx-auto">
          <div className="text-headline-lg font-bold text-primary">
            {t("appName")}
          </div>
          <div className="flex items-center gap-4">
            {isRegistered ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-label-md text-secondary font-bold hover:bg-surface-bright transition-colors px-4 py-2 rounded-lg"
                >
                  Dashboard
                </Link>
                <LanguageToggle />
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Header */}
      <header className="md:hidden flex justify-between items-center px-container-padding h-16 w-full bg-surface/80 backdrop-blur-xl fixed top-0 z-50 border-b border-outline-variant/30">
        <div className="text-headline-lg-mobile font-bold text-primary">
          {t("appName")}
        </div>
        <div className="flex items-center gap-2">
          {isRegistered && (
            <Link
              href="/dashboard"
              className="text-xs font-bold text-secondary px-3 py-1.5 rounded-lg bg-secondary/10"
            >
              Dashboard
            </Link>
          )}
          <LanguageToggle />
        </div>
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

          {isRegistered ? (
            <Link href="/dashboard">
              <GlowButton className="px-10 py-4 mb-20">
                Go to Dashboard
                <Rocket className="w-5 h-5" />
              </GlowButton>
            </Link>
          ) : (
            <Link href="/register">
              <GlowButton className="px-10 py-4 mb-20">
                {t("startEarning")}
                <Rocket className="w-5 h-5" />
              </GlowButton>
            </Link>
          )}

          {/* Trust Banner */}
          <GlassPanel className="w-full max-w-5xl rounded-2xl p-6 mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
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

          {/* Deposit Methods — REGISTERED-ONLY for sensitive details */}
          <GlassPanel className="w-full max-w-5xl rounded-2xl p-6 mb-20 text-left">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2">
              <h2 className="text-title-lg font-bold text-primary">Official Deposit Methods</h2>
              {!authLoading && !isRegistered && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1 text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5" />
                  Registered members only
                </span>
              )}
              {!authLoading && isRegistered && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 border border-green-200 px-3 py-1 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified member access
                </span>
              )}
            </div>

            {authLoading ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-5 animate-pulse">
                  <div className="h-4 w-32 bg-surface-bright rounded mb-4" />
                  <div className="h-20 w-full bg-surface-bright rounded" />
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-5 animate-pulse">
                  <div className="h-4 w-32 bg-surface-bright rounded mb-4" />
                  <div className="h-20 w-full bg-surface-bright rounded" />
                </div>
              </div>
            ) : isRegistered ? (
              <>
                <p className="text-sm text-on-surface-variant mb-6">
                  You are logged in as a registered member. Below are your official deposit channels. Choose one method per deposit.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                    <h3 className="text-sm font-bold text-on-surface">Option 1 — Online Transfer</h3>
                    <div className="mt-3 rounded-lg bg-[#0B2E1F] p-4 text-sm text-white">
                      <p className="font-semibold text-[#A8E636]">Send payment to:</p>
                      <p className="mt-1 font-medium">Jazz Cash</p>
                      <p>Account Name: {PAYMENT_ACCOUNT.accountName}</p>
                      <p>Jazz Cash Number: {PAYMENT_ACCOUNT.accountNumber}</p>
                    </div>
                    <p className="mt-3 text-xs text-on-surface-variant">
                      Transfer your deposit amount to the above Jazz Cash account, then upload your payment receipt in TDX for verification.
                    </p>
                    <Link
                      href="/dashboard#deposit-form"
                      className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-on-primary hover:bg-primary/90"
                    >
                      Deposit Now
                    </Link>
                  </div>
                  <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-5">
                    <h3 className="text-sm font-bold text-on-surface">Option 2 — Cash to Agent</h3>
                    <div className="mt-3 rounded-lg border border-outline-variant/30 bg-surface-container-low p-4">
                      <p className="text-sm font-semibold">Agent Name: Shakeela</p>
                      <p className="text-xs text-on-surface-variant mt-1">Authorized cash collection agent. Hand cash directly to the agent and record the payment date.</p>
                    </div>
                    <p className="mt-3 text-xs text-on-surface-variant">
                      Use Cash to Agent if you prefer handing cash directly. Your payment date will be recorded and verified by admin.
                    </p>
                    <Link
                      href="/dashboard#deposit-form"
                      className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-secondary px-4 text-xs font-bold text-on-secondary hover:bg-secondary/90"
                    >
                      Deposit via Agent
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface-variant mb-6">
                  TDX supports two official deposit methods for every registered member. For security, official payment details are visible only to registered and logged-in members.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                    <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      Option 1 — Online Transfer
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    </h3>
                    <div className="mt-3 rounded-lg bg-[#0B2E1F]/90 p-4 text-sm text-white relative">
                      <div className="flex items-center gap-2 text-[#A8E636] font-semibold">
                        <EyeOff className="w-4 h-4" />
                        Official account hidden
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-24 bg-white/20 rounded blur-[0.5px]" />
                        <div className="h-3 w-32 bg-white/20 rounded blur-[0.5px]" />
                        <div className="h-3 w-40 bg-white/20 rounded blur-[0.5px]" />
                      </div>
                      <p className="mt-3 text-xs text-white/70">Jazz Cash details are available after you register and log in.</p>
                    </div>
                    <p className="mt-3 text-xs text-on-surface-variant">
                      Register to view the official Jazz Cash account and upload your payment receipt for verification.
                    </p>
                  </div>
                  <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                    <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      Option 2 — Cash to Agent
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    </h3>
                    <div className="mt-3 rounded-lg border border-outline-variant/30 bg-surface-bright p-4 relative">
                      <div className="flex items-center gap-2 text-on-surface-variant font-semibold text-sm">
                        <EyeOff className="w-4 h-4" />
                        Authorized agent hidden
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-28 bg-surface-container-high rounded blur-[0.5px]" />
                        <div className="h-2 w-48 bg-surface-container-high rounded blur-[0.5px]" />
                      </div>
                      <p className="mt-3 text-xs text-on-surface-variant">Agent details are available for registered members only.</p>
                    </div>
                    <p className="mt-3 text-xs text-on-surface-variant">
                      Cash to Agent creates a member-specific financial record, so it is usable only by authenticated members.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/register"
                    className="h-11 inline-flex items-center justify-center rounded-lg bg-primary px-6 text-sm font-bold text-on-primary hover:bg-primary/90 transition-colors"
                  >
                    Register to View Deposit Details
                  </Link>
                  <Link
                    href="/login"
                    className="h-11 inline-flex items-center justify-center rounded-lg border border-outline-variant/50 px-6 text-sm font-semibold text-on-surface hover:bg-surface-bright transition-colors"
                  >
                    Login
                  </Link>
                </div>
                <p className="mt-4 text-xs text-on-surface-variant/70 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  No Jazz Cash number or agent details are shown to unregistered visitors.
                </p>
              </>
            )}
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
