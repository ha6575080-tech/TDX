"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel } from "@/components/ui";

interface ProfileData {
  id: string;
  username: string;
  full_name: string;
  address: string;
  city: string;
  mobile_number: string;
  account_number: string;
  payment_method: string;
  email: string | null;
  is_active: boolean;
  is_suspended: boolean;
  role: string;
  profit_activation_date: string | null;
}

const inputCls =
  "w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:shadow-[0_0_8px_rgba(208,255,130,0.25)] disabled:opacity-60 disabled:cursor-not-allowed";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // editable fields (only permitted ones)
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [mobile, setMobile] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, address, city, mobile_number, account_number, payment_method, email, is_active, is_suspended, role, profit_activation_date")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      const p = data as ProfileData;
      setProfile(p);
      setFullName(p.full_name ?? "");
      setAddress(p.address ?? "");
      setCity(p.city ?? "");
      setMobile(p.mobile_number ?? "");
      setAccountNumber(p.account_number ?? "");
      setPaymentMethod(p.payment_method ?? "");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to load profile" });
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Only permitted columns — server column-level grants enforce this too
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          address: address.trim(),
          city: city.trim(),
          mobile_number: mobile.trim(),
          account_number: accountNumber.trim(),
          payment_method: paymentMethod,
        })
        .eq("id", user.id);
      if (error) throw error;
      setMsg({ ok: true, text: "Profile updated successfully." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
        <TopNav active="/profile" />
        <BottomNav active="/profile" />
        <div className="max-w-3xl mx-auto px-4 pt-20 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/profile" />
      <BottomNav active="/profile" />
      <div className="max-w-3xl mx-auto px-4 pt-6 md:pt-8 pb-8 space-y-6">
        <h1 className="text-headline-lg font-bold text-primary">Profile</h1>
        {profile && (
          <GlassPanel className="p-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container text-xl font-bold">
              {(profile.full_name ?? profile.username).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-on-surface">{profile.full_name}</p>
              <p className="text-sm text-on-surface-variant">@{profile.username}</p>
              <div className="mt-1 flex gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${profile.is_active ? "bg-primary/15 text-primary border border-primary/30" : "bg-surface-bright text-on-surface-variant"}`}>
                  {profile.is_suspended ? "Suspended" : profile.is_active ? "Active" : "Inactive"}
                </span>
                <span className="inline-flex rounded-full bg-surface-bright px-2 py-0.5 text-xs text-on-surface-variant">{profile.role}</span>
              </div>
            </div>
          </GlassPanel>
        )}

        <GlassPanel className="p-6">
          <h2 className="text-title-md font-semibold mb-4">Edit Profile</h2>
          <p className="text-xs text-on-surface-variant mb-4">You can edit your personal details. Financial balances, investment amount, role and approval status cannot be changed here (server-authoritative).</p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Username (cannot change role via this form)</label>
              <input value={profile?.username ?? ""} disabled className={inputCls} />
              <p className="mt-1 text-xs text-on-surface-variant/70">Username is not editable after creation (server protects role/is_active).</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Mobile Number</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Account Number</label>
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                {["EASY PAISA", "JAZZ CASH", "NAYAPAY", "BANK", "UPAISA", "EASYPAISA", "JAZZCASH"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {/* Read-only authoritative fields — never editable by member */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/20">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-on-surface-variant">Role</label>
                <input value={profile?.role ?? ""} disabled className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-on-surface-variant">Profit Activation Date</label>
                <input value={profile?.profit_activation_date ? new Date(profile.profit_activation_date).toLocaleDateString("en-GB") : "—"} disabled className={inputCls} />
              </div>
            </div>
            <p className="text-xs text-on-surface-variant/70">Financial balances, investment amount, approval status and admin privileges are managed server-side and cannot be edited here.</p>

            {msg && (
              <div className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-primary/10 text-primary border border-primary/30" : "bg-error/10 text-error border border-error/30"}`}>
                {msg.text}
              </div>
            )}
            <button type="submit" disabled={saving} className="h-11 w-full rounded-lg bg-primary text-on-primary font-bold hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </GlassPanel>

        <div className="flex gap-2">
          <button onClick={() => router.push("/dashboard")} className="h-10 rounded-lg border border-outline-variant/40 px-4 text-sm font-semibold text-on-surface hover:bg-surface-bright">Back to Dashboard</button>
          <button onClick={() => router.push("/settings")} className="h-10 rounded-lg bg-surface-bright px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-high">Go to Settings</button>
        </div>
      </div>
    </main>
  );
}
