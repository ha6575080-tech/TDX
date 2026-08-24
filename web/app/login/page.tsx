"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { GlassPanel, GlowButton, LanguageToggle } from "@/components/ui";

const PHONE_REGEX = /^03[0-9]{9}$/;

function toAuthEmail(identifier: string): string {
  if (PHONE_REGEX.test(identifier)) {
    return `0${identifier}@tdx.app`;
  }
  return identifier;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const email = toAuthEmail(identifier.trim());

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-base text-on-surface flex items-center justify-center p-4 antialiased overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb-glow bg-primary/20 w-96 h-96 top-20 left-10" />
        <div className="orb-glow bg-secondary/15 w-[500px] h-[500px] bottom-40 right-20" style={{ animationDelay: "-3s" }} />
      </div>

      <div className="w-full max-w-md mx-auto relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-headline-lg font-bold text-primary tracking-tighter">
            {t("appName")}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            {t("welcomeBack")}
          </p>
        </div>

        <GlassPanel className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("emailOrMobile")}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or 03XXXXXXXXX"
                className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(208,255,130,0.3)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(208,255,130,0.3)]"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <GlowButton
              type="submit"
              disabled={loading || identifier.trim() === "" || password === ""}
              className="w-full disabled:opacity-50"
            >
              <LogIn className="w-5 h-5" />
              {loading ? t("loggingIn") : t("login")}
            </GlowButton>
          </form>

          <div className="mt-6 flex items-start gap-2 text-on-surface-variant opacity-75">
            <ShieldCheck className="w-4 h-4 mt-0.5" />
            <p className="text-label-sm leading-tight">
              {t("securePlatform")}
            </p>
          </div>
        </GlassPanel>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          {t("dontHaveAccount")}{" "}
          <Link href="/register" className="font-semibold text-primary hover:text-primary-fixed">
            {t("register")}
          </Link>
        </p>

        <div className="mt-4 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  );
}