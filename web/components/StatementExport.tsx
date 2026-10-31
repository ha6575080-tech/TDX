"use client";
import { useState } from "react";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { statementExport, statementMoney, type StatementData, type StatementFormat } from "@/lib/statement-export";
export type { StatementData } from "@/lib/statement-export";
export interface StatementExportProps {
    data: StatementData;
    language: string;
}
export default function StatementExport({ data, language }: StatementExportProps) {
    const { t } = useI18n();
    const ur = language === "ur";
    const [pending, setPending] = useState<StatementFormat | null>(null), [error, setError] = useState<string | null>(null);
    const download = async (format: StatementFormat) => {
        if (pending)
            return;
        setPending(format);
        setError(null);
        try {
            const file = await statementExport(data, language, format);
            const { saveAs } = await import("file-saver");
            saveAs(file.blob, file.filename);
        }
        catch {
            setError(ur ? "گوشوارہ تیار نہیں ہو سکا۔ دوبارہ کوشش کریں۔" : "The statement could not be prepared. Please try again.");
        }
        finally {
            setPending(null);
        }
    };
    return <div dir={ur ? "rtl" : "ltr"}>
    <div className="glass-panel p-6 mb-4">
      <div className="flex items-center gap-4 mb-5"><Image src="/Logo.jpg" alt="TDX" width={64} height={64}/><div><h2 className="text-xl font-bold">TDX Investment</h2><p className="text-sm text-white/70">{t("investmentSummary")}</p></div></div>
      <p className="font-semibold">{data.profile.full_name}</p><p className="text-sm text-white/70">@{data.profile.username} · {data.profile.mobile_number}</p><p className="text-sm text-white/70">{t("city")}: {data.profile.city}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
        {[[ur ? "منظور شدہ جمع رقم" : "Approved deposits", data.summary.totalDeposited], [ur ? "ادا شدہ مجموعی منافع" : "Paid profit (gross)", data.summary.totalPayouts], [ur ? "خالص ادا شدہ نکاسی" : "Withdrawals (net)", data.summary.totalWithdrawn]].map(([label, value]) => <div key={String(label)}><span className="text-white/60 text-xs block">{label}</span><p className="font-bold">{statementMoney(value)}</p></div>)}
      </div>
      <p className="text-xs text-white/60">{ur ? "شامل ریکارڈ" : "Records included"}: {data.deposits.length} {ur ? "ڈپازٹ" : "deposits"} · {data.payouts.length} {ur ? "منافع" : "profit records"} · {data.withdrawals.length} {ur ? "نکاسی" : "withdrawals"} · {data.returns?.length ?? 0} {ur ? "سرمایہ کی واپسی" : "principal returns"}</p>
      {data.summary.totalWithdrawalFees != null && <p className="text-xs text-white/60 mt-2">{ur ? "نکاسی فیس" : "Withdrawal fees"}: {statementMoney(data.summary.totalWithdrawalFees)}</p>}
      {data.summary.totalReturnedPrincipal != null && <p className="text-xs text-white/60 mt-2">{ur ? "واپس شدہ اصل سرمایہ" : "Principal returned"}: {statementMoney(data.summary.totalReturnedPrincipal)}</p>}
      <p className="text-xs text-white/60 mt-2">{ur ? "سپورٹ" : "Support"}: 0308-3958294</p>
    </div>
    <div className="flex flex-wrap gap-3">
      {(["pdf", "word", "png"] as const).map(format => <button key={format} disabled={pending !== null} onClick={() => void download(format)} className="btn-3d-lime rounded-lg px-4 py-2 disabled:opacity-50">{pending === format ? (ur ? "تیار ہو رہا ہے…" : "Preparing…") : format === "pdf" ? "PDF" : format === "word" ? "Word" : ur ? "PNG صفحات" : "PNG pages"}</button>)}
    </div>
    <p className="text-xs text-white/60 mt-3">{ur ? "ایک سے زیادہ صفحات کی تصاویر ZIP فائل میں ملیں گی۔" : "Multi-page image downloads include every page in a ZIP file."}</p>
    {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}
  </div>;
}
