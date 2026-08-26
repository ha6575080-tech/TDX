"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

interface Member {
  id: string;
  full_name: string;
  mobile_number: string;
  whatsapp_number: string | null;
  city: string | null;
  status: string;
  created_at: string;
}

const EMPTY_FORM = {
  full_name: "",
  mobile_number: "",
  whatsapp_number: "",
  address: "",
  city: "",
  invested_amount: "",
  picture_url: "",
  payment_method: "",
  account_number: "",
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
}

export default function AgentPortalPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAgent, setIsAgent] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadMembers = useCallback(async () => {
    const r = await fetch("/api/agents/onboard");
    if (r.status === 401) {
      router.push("/login");
      return;
    }
    if (r.status === 403) {
      setIsAgent(false);
      setChecking(false);
      return;
    }
    const json = await r.json();
    setIsAgent(true);
    setMembers(json.members ?? []);
    setChecking(false);
  }, [router]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/agents/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await r.json();
      if (!r.ok) {
        setFeedback({ ok: false, msg: json.error || t("forbidden") });
      } else {
        setFeedback({ ok: true, msg: t("onboardSuccess") });
        setForm({ ...EMPTY_FORM });
        await loadMembers();
      }
    } catch {
      setFeedback({ ok: false, msg: t("onboardFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-white/20 border-t-lime-400 rounded-full animate-spin" />
          <p className="text-sm text-white/70">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!isAgent) {
    return (
      <div className="p-6">
        <p className="glass-panel p-6 text-center text-white/60">{t("agentOnlyArea")}</p>
      </div>
    );
  }

  const field = "w-full glass-panel px-3 py-2 text-sm bg-transparent border border-white/10 rounded-lg";
  const label = "text-white/50 text-xs block mb-1";

  return (
    <div className="p-6 space-y-6" dir={lang === "ur" ? "rtl" : "ltr"}>
      <h1 className="text-2xl font-bold">{t("agentPortal")}</h1>

      {/* Onboarding form */}
      <form onSubmit={submit} className="glass-panel p-6 space-y-4">
        <h2 className="text-xl font-bold mb-2">{t("onboardNewMember")}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className={label}>{t("fullName")} *</span>
            <input required value={form.full_name} onChange={set("full_name")} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("memberMobile")} *</span>
            <input required value={form.mobile_number} onChange={set("mobile_number")} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("mobileNumber")}</span>
            <input value={form.whatsapp_number} onChange={set("whatsapp_number")} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("city")}</span>
            <input value={form.city} onChange={set("city")} className={field} />
          </label>
          <label className="block md:col-span-2">
            <span className={label}>{t("fullAddress")}</span>
            <input value={form.address} onChange={set("address")} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("investedAmountPkr")} *</span>
            <input
              required
              type="number"
              min="1"
              step="0.01"
              value={form.invested_amount}
              onChange={set("invested_amount")}
              className={field}
            />
          </label>
          <label className="block">
            <span className={label}>{t("paymentMethod")}</span>
            <input
              value={form.payment_method}
              onChange={set("payment_method")}
              placeholder="EASYPAISA / JAZZCASH / BANK"
              className={field}
            />
          </label>
          <label className="block">
            <span className={label}>{t("accountNumber")}</span>
            <input value={form.account_number} onChange={set("account_number")} className={field} />
          </label>
          <label className="block">
            <span className={label}>{t("pictureUrlOptional")}</span>
            <input value={form.picture_url} onChange={set("picture_url")} className={field} />
          </label>
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.ok ? "text-lime-300" : "text-red-400"}`}>{feedback.msg}</p>
        )}

        <button type="submit" disabled={submitting} className="btn-3d-lime px-6 py-2 rounded-xl disabled:opacity-50">
          {submitting ? t("processing") : t("onboardMember")}
        </button>
      </form>

      {/* Members list */}
      <div className="glass-panel p-4">
        <h2 className="text-xl font-bold mb-3">{t("myMembers")}</h2>
        {members.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50">
                <th className="pb-2">{t("fullName")}</th>
                <th className="pb-2">{t("memberMobile")}</th>
                <th className="pb-2">{t("city")}</th>
                <th className="pb-2">{t("status")}</th>
                <th className="pb-2">{t("requestedDate")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-2 font-semibold">{m.full_name}</td>
                  <td className="py-2">{m.mobile_number}</td>
                  <td className="py-2">{m.city || "—"}</td>
                  <td className="py-2">{m.status}</td>
                  <td className="py-2">{fmtDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-white/50">{t("noMembers")}</p>
        )}
      </div>
    </div>
  );
}
