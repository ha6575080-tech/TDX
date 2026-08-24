"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { GlassPanel, GlowButton, LanguageToggle } from "@/components/ui";

const PAYMENT_METHODS = ["EASY PAISA", "JAZZ CASH", "NAYAPAY", "BANK", "UPAISA"];
const PHONE_REGEX = /^03[0-9]{9}$/;

function toAuthEmail(identifier: string): string {
  if (PHONE_REGEX.test(identifier)) {
    return `0${identifier}@tdx.app`;
  }
  return identifier;
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
  const [referralCode, setReferralCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finalUsername, setFinalUsername] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

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

    if (!canSubmit) {
      setError("Please fill in all required fields correctly.");
      return;
    }

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
        if (signUpError.code === "user_already_exists") {
          setAlreadyRegistered(true);
          return;
        }
        throw signUpError;
      }
      if (!data.user) throw new Error("Sign up did not return a user.");

      const userId = data.user.id;

      const randomPart = Array.from(
        { length: 6 },
        () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[
          Math.floor(Math.random() * 36)
        ]
      ).join("");
      const finalReferralCode =
        referralCode.trim() !== ""
          ? referralCode.trim()
          : `TDX${randomPart}`;

      let finalUsernameValue = username.trim();
      const profilePayload = {
        id: userId,
        full_name: fullName.trim(),
        address: address.trim(),
        city: city.trim(),
        mobile_number: mobileNumber.trim(),
        account_number: accountNumber.trim(),
        payment_method: paymentMethod,
        username: finalUsernameValue,
        referral_code: finalReferralCode,
      };

      try {
        let { error: profileError } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });

        if (profileError) {
          const suffix = Array.from(
            { length: 4 },
            () => "abcdefghijklmnopqrstuvwxyz0123456789"[
              Math.floor(Math.random() * 36)
            ]
          ).join("");
          finalUsernameValue = `${username.trim()}_${suffix}`;
          setFinalUsername(finalUsernameValue);

          const retry = await supabase
            .from("profiles")
            .upsert(
              { ...profilePayload, username: finalUsernameValue },
              { onConflict: "id" }
            );
          profileError = retry.error;
        }

        if (profileError) throw profileError;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Registration failed at profile save:", err);
        setError(`Registration failed at profile save: ${message}`);
        return;
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

      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Registration failed at sign up:", err);
      setError(`Registration failed at sign up: ${message}`);
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} ${
                  password !== "" && !passwordValid ? "border-error" : ""
                }`}
              />
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
                This phone/email is already registered — please{" "}
                <Link href="/login" className="font-semibold text-primary underline">
                  log in
                </Link>{" "}
                instead.
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