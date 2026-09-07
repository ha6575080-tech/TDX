"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel, LanguageToggle } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, lang } = useI18n();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setRole((data as any)?.role ?? "user");
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
        <TopNav active="/settings" />
        <BottomNav active="/settings" />
        <div className="max-w-3xl mx-auto px-4 pt-20 flex justify-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/settings" />
      <BottomNav active="/settings" />
      <div className="max-w-3xl mx-auto px-4 pt-6 md:pt-8 pb-8 space-y-6">
        <h1 className="text-headline-lg font-bold text-primary">Settings</h1>

        <GlassPanel className="p-6 space-y-6">
          <div>
            <h2 className="text-title-md font-semibold text-on-surface">Language</h2>
            <p className="text-sm text-on-surface-variant mb-3">Choose your preferred language. This is stored locally and affects UI text.</p>
            <LanguageToggle />
            <p className="mt-2 text-xs text-on-surface-variant/70">Current: {lang === "en" ? "English" : "اردو"}</p>
          </div>

          <div className="border-t border-outline-variant/20 pt-6">
            <h2 className="text-title-md font-semibold text-on-surface">Notifications</h2>
            <p className="text-sm text-on-surface-variant mb-3">In-app notifications and push are managed via your browser. You can enable/disable in your device settings.</p>
            <div className="rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
              No sensitive keys are shown here. Server configuration (Supabase keys, SMTP passwords, Gemini API keys, service-role keys, CRON secrets, VAPID private keys) is never exposed to members or admins in this UI.
            </div>
          </div>

          <div className="border-t border-outline-variant/20 pt-6">
            <h2 className="text-title-md font-semibold text-on-surface">Account</h2>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => router.push("/profile")} className="h-10 rounded-lg bg-primary-container px-4 text-sm font-semibold text-on-primary-container hover:bg-primary-fixed">Open Profile</button>
              <button onClick={() => router.push("/chat")} className="h-10 rounded-lg bg-surface-bright px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-high">Contact Support</button>
            </div>
          </div>

          {role === "admin" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Admin Note</p>
              <p className="mt-1">You are logged in as Super Admin. For security, server secrets and environment variables are not displayed in Settings or any client UI.</p>
            </div>
          )}
        </GlassPanel>

        <button onClick={() => router.push("/dashboard")} className="h-10 rounded-lg border border-outline-variant/40 px-4 text-sm font-semibold text-on-surface hover:bg-surface-bright">Back to Dashboard</button>
      </div>
    </main>
  );
}
