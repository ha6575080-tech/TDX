"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { passwordPolicyError } from "@/lib/password-policy";

export default function PasswordChangeForm() {
  const { lang } = useI18n();
  const urdu = lang === "ur";
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const saving = useRef(false);
  const policy = urdu ? "کم از کم 12 حروف کا منفرد پاس ورڈ استعمال کریں۔" : "Use a unique password with at least 12 characters. A long passphrase works well.";
  const failure = urdu ? "تبدیلی کی تصدیق نہیں ہو سکی۔ دوبارہ لاگ ان کریں یا سپورٹ سے رابطہ کریں۔" : "The change could not be confirmed. Try signing in again or contact support.";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setError(null); setMessage(null);
    const policyError = passwordPolicyError(password);
    if (policyError) { setError(policyError === "too_long" ? (urdu ? "پاس ورڈ بہت لمبا ہے۔ اسے مختصر کریں۔" : "This password is too long. Please shorten it.") : policy); return; }
    if (password !== confirmation) { setError(urdu ? "نئے پاس ورڈ ایک جیسے نہیں ہیں۔" : "The new passwords do not match."); return; }
    if (current === password) { setError(urdu ? "نیا پاس ورڈ مختلف رکھیں۔" : "Choose a different new password."); return; }
    saving.current = true; setBusy(true);
    try {
      const response = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: password }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        setError(data.code === "current_password_invalid" ? (urdu ? "موجودہ پاس ورڈ درست نہیں ہے۔ دوبارہ کوشش کریں۔" : "Your current password could not be verified. Check it and try again.") : data.code === "invalid_password" ? policy : failure);
        return;
      }
      setCurrent(""); setPassword(""); setConfirmation("");
      setMessage(data.otherSessionsSignedOut ? (urdu ? "پاس ورڈ تبدیل ہو گیا۔ دیگر آلات پر دوبارہ لاگ ان کرنا ہوگا۔" : "Password changed. Other devices will be asked to sign in again.") : (urdu ? "پاس ورڈ تبدیل ہو گیا، مگر دیگر سیشنز کے سائن آؤٹ کی تصدیق نہیں ہو سکی۔" : "Password changed, but signing out other sessions could not be confirmed."));
    } catch { setError(failure); }
    finally { saving.current = false; setBusy(false); }
  }
  const input = "mt-1 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary";
  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby="password-change-heading">
      <h2 id="password-change-heading" className="text-title-md font-semibold text-on-surface">{urdu ? "پاس ورڈ تبدیل کریں" : "Change password"}</h2>
      <p id="password-policy" className="text-sm text-on-surface-variant">{policy}</p>
      <div><label htmlFor="current-password">{urdu ? "موجودہ پاس ورڈ" : "Current password"}</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} disabled={busy} className={input} /></div>
      <div><label htmlFor="new-password">{urdu ? "نیا پاس ورڈ" : "New password"}</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} aria-describedby="password-policy" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={input} /></div>
      <div><label htmlFor="confirm-password">{urdu ? "نئے پاس ورڈ کی تصدیق" : "Confirm new password"}</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} className={input} /></div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      <button type="submit" disabled={busy} className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-on-primary disabled:opacity-50">{busy ? (urdu ? "محفوظ کیا جا رہا ہے…" : "Saving…") : (urdu ? "پاس ورڈ تبدیل کریں" : "Change password")}</button>
    </form>
  );
}
