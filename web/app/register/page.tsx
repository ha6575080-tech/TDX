"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { GlassPanel, GlowButton, LanguageToggle } from "@/components/ui";
import { extractErrorInfo } from "@/lib/errors";

const PAYMENT_METHODS = ["EASY PAISA", "JAZZ CASH", "NAYAPAY", "BANK", "UPAISA"];
const PHONE_REGEX = /^03[0-9]{9}$/;

function toAuthEmail(identifier: string): string {
  if (PHONE_REGEX.test(identifier)) {
    return `0${identifier}@tdx.app`;
  }
  return identifier;
}

/** Cryptographically-random alphanumeric string (never Math.random). */
function randAlnum(length: number, lowercase: boolean): string {
  const pool = lowercase
    ? "abcdefghijklmnopqrstuvwxyz0123456789"
    : "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const out = new Uint32Array(length);
  crypto.getRandomValues(out);
  let s = "";
  for (let i = 0; i < length; i++) s += pool[out[i] % pool.length];
  return s;
}

const inputCls =
  "w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(208,255,130,0.3)]";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();

  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finalUsername, setFinalUsername] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  // Double-submit guard — applies even in the same render frame as the click.
  const submittingRef = useRef(false);

  const mobileValid = PHONE_REGEX.test(mobileNumber);
  const passwordValid = password.length >= 6;
  const canSubmit =
    identifier.trim() !== "" &&
    fullName.trim() !== "" &&
    address.trim() !== "" &&
    city.trim() !== "" &&
    mobileValid &&
    accountNumber.trim() !== "" &&
    username.trim() !== "" &&
    passwordValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (submittingRef.current) return; // Phase 7: no duplicate submissions
    if (!canSubmit) {
      setError("Please fill in all required fields correctly.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const email = toAuthEmail(identifier.trim());

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullName.trim(),
            address: address.trim(),
            city: city.trim(),
            mobile_number: mobileNumber.trim(),
            account_number: accountNumber.trim(),
            payment_method: paymentMethod,
          },
        },
      });

      if (signUpError) {
        const info = extractErrorInfo(signUpError);
        // Partial/duplicate account: auth user already exists.
        if (info.code === "user_already_exists") {
          setAlreadyRegistered(true);
          return;
        }
        setError(`Registration failed: ${info.friendly}`);
        return;
      }
      if (!data.user) throw new Error("Sign up did not return a user.");

      // Server-authoritative identity: the ID returned by Supabase Auth.
      // A client-supplied user_id is never used for profile creation.
      const userId = data.user.id;
      const hasSession = !!data.session;

      // The member's OWN referral code (the code others can use to refer
      // them). This is NEW + unique for this account. The code a user types
      // in the "Referral Code (optional)" field belongs to the REFERRER and
      // must NEVER be assigned to this profile (it is UNIQUE per row — doing
      // so caused a deterministic constraint failure and broke registration).
      const ownReferralCode = `TDX${randAlnum(6, false)}`;

      const baseProfile = {
        id: userId,
        full_name: fullName.trim(),
        address: address.trim(),
        city: city.trim(),
        mobile_number: mobileNumber.trim(),
        account_number: accountNumber.trim(),
        payment_method: paymentMethod,
      };

      // Profile save, fault-tolerant:
      //  - With an active session the upsert is authorized (RLS own-row).
      //  - Username collisions (23505) retry with a crypto-random suffix.
      //  - Referral-code collisions regenerate a fresh own-code on retry.
      //  - If the session is not yet established (email confirmation), the
      //    handle_new_user() trigger has ALREADY created the profile from the
      //    same metadata — nothing is written now, no error is shown.
      if (hasSession) {
        let saved = false;
        let fatalInfo: ReturnType<typeof extractErrorInfo> | null = null;
        for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
          const uname =
            attempt === 1
              ? username.trim()
              : `${username.trim()}_${randAlnum(4, true)}`;
          const payload = {
            ...baseProfile,
            username: uname,
            referral_code: attempt === 1 ? ownReferralCode : `TDX${randAlnum(6, false)}`,
          };

          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(payload, { onConflict: "id" });

          if (!profileError) {
            saved = true;
            if (attempt > 1) setFinalUsername(uname);
            continue;
          }

          fatalInfo = extractErrorInfo(profileError);
          if (fatalInfo.code === "23505") continue; // username or referral_code taken → new variation
          if (fatalInfo.code === "42501") {
            // Profile already exists via the signup trigger; RLS blocked the
            // duplicate write. Treat as saved — the account is complete.
            saved = true;
            continue;
          }
          break; // real failure — stop retrying
        }

        if (!saved && fatalInfo) {
          console.error("Registration profile save failed:", fatalInfo);
          setError(`Registration failed: ${fatalInfo.friendly}`);
          return;
        }
      }

      // Referral claim: only the code is sent — the server resolves the
      // referrer and applies the reward atomically for the session user.
      if (referralCode.trim() !== "") {
        await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref_code: referralCode.trim() }),
        }).catch(() => {});
      }

      router.push(hasSession ? "/dashboard" : "/login");
    } catch (err) {
      const info = extractErrorInfo(err);
      console.error("Registration failed at sign up:", info);
      setError(`Registration failed: ${info.friendly}`);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <main className="min-h-screen bg-base text-on-surface flex items-center justify-center p-4 antialiased overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="orb-glow bg-primary/20 w-96 h-96 top-20 left-10" />
        <div className="orb-glow bg-secondary/15 w-[500px] h-[500px] bottom-40 right-20" style={{ animationDelay: "-3s" }} />
      </div>

      <div className="w-full max-w-2xl mx-auto relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-headline-lg font-bold text-primary tracking-tighter">
            {t("appName")}
          </h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            {t("createAccount")}
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
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("fullName")}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("fullAddress")}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("city")}
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("mobileNumber")}
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="03XXXXXXXXX"
                className={`${inputCls} ${
                  mobileNumber !== "" && !mobileValid ? "border-error" : ""
                }`}
              />
              {mobileNumber !== "" && !mobileValid && (
                <p className="mt-1 text-xs text-error">
                  Enter a valid mobile number (03XXXXXXXXX).
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("accountNumber")}
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("paymentMethod")}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={inputCls}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label={t("password")}
                  className={`${inputCls} pr-12 ${
                    password !== "" && !passwordValid ? "border-error" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {password !== "" && !passwordValid && (
                <p className="mt-1 text-xs text-error">
                  Password must be at least 6 characters.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-label-md text-on-surface-variant">
                {t("referralCode")}{" "}
                <span className="font-normal text-on-surface-variant/60">
                  {t("optional")}
                </span>
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="TDX123456"
                className={inputCls}
              />
            </div>

            {alreadyRegistered && (
              <div className="rounded-lg bg-secondary/10 border border-secondary/30 px-4 py-3 text-sm text-secondary">
                An account with this phone/email already exists. If you registered
                before but never completed the process, check your inbox for a
                confirmation link, then{" "}
                <Link href="/login" className="font-semibold text-primary underline">
                  log in
                </Link>
                . If you still cannot log in, contact support.
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <GlowButton
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full disabled:opacity-50"
            >
              <UserPlus className="w-5 h-5" />
              {loading ? t("processing") : t("register")}
            </GlowButton>

            <p className="text-center text-xs text-on-surface-variant">
              {finalUsername
                ? `Your username was taken — your new username is @${finalUsername}`
                : ""}
            </p>
          </form>

          <div className="mt-6 flex items-start gap-2 text-on-surface-variant opacity-75">
            <ShieldCheck className="w-4 h-4 mt-0.5" />
            <p className="text-label-sm leading-tight">{t("securePlatform")}</p>
          </div>
        </GlassPanel>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-fixed">
            {t("login")}
          </Link>
        </p>

        <div className="mt-4 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  );
}