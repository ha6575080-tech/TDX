"use client";

import { useRef } from "react";
import { useI18n } from "@/lib/i18n";

interface StatementData {
  profile: { full_name: string; username: string; mobile_number: string; city: string; status: string; created_at: string };
  deposits: Array<Record<string, unknown>>;
  payouts: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  summary: { totalDeposited: number; totalPayouts: number; totalWithdrawn: number };
}

export type { StatementData };

export interface StatementExportProps {
  data: StatementData;
  language: string;
}

function fmtDate(d: string | undefined, lang: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

function money(v: number | undefined): string {
  return "Rs " + (v ?? 0).toLocaleString();
}

export default function StatementExport({ data, language }: StatementExportProps) {
  const { t } = useI18n();
  const statementRef = useRef<HTMLDivElement>(null);
    const lang = (language === "ur" ? "ur" : "en") as "en" | "ur";

  const exportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTableMod = await import("jspdf-autotable");
    const autoTable = autoTableMod.default ?? autoTableMod.autoTable ?? autoTableMod;

    const doc = new jsPDF();
    const isUr = lang === "ur";

    doc.setFontSize(18);
    doc.text(isUr ? "بیانیے سرمایہ کاری" : "Investment Statement", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`${isUr ? "نام" : "Name"}: ${data.profile.full_name}`, 14, 35);
    doc.text(`@${data.profile.username}`, 14, 41);
    doc.text(`${isUr ? "موبائل" : "Mobile"}: ${data.profile.mobile_number}`, 14, 47);
    doc.text(`${isUr ? "شہر" : "City"}: ${data.profile.city}`, 14, 53);
    doc.text(`${isUr ? "تیار" : "Generated"}: ${fmtDate(new Date().toISOString(), lang)}`, 14, 59);

    doc.setFontSize(12);
    doc.text(isUr ? "ذیبین" : "Deposits", 14, 70);
    autoTable(doc, {
      startY: 73,
      head: [[isUr ? "رقم" : "Amount", isUr ? "اسٹیٹس" : "Status", isUr ? "تاریخ" : "Date"]],
      body: data.deposits.map((d) => {
        const dd = d as { amount: number; status: string; created_at: string };
        return [money(dd.amount), dd.status, fmtDate(dd.created_at, lang)];
      }),
    });

    const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
    let y = (docAny.lastAutoTable?.finalY ?? 110) + 10;

    doc.text(isUr ? "ادائیگیاں" : "Payouts", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [[isUr ? "رقم" : "Amount", "%", isUr ? "ماہ/سال" : "Month/Year", isUr ? "اسٹیٹس" : "Status", isUr ? "تاریخ" : "Date"]],
      body: data.payouts.map((p) => {
        const pp = p as { amount: number; percentage_applied: number; month: number; year: number; status: string; created_at: string };
        return [money(pp.amount), `${pp.percentage_applied}%`, `${pp.month}/${pp.year}`, pp.status, fmtDate(pp.created_at, lang)];
      }),
    });

    y = (docAny.lastAutoTable?.finalY ?? 180) + 10;
    doc.setFontSize(11);
    doc.text(`${isUr ? "کل جمع شدہ" : "Total Deposited"}: ${money(data.summary.totalDeposited)}`, 14, y);
    doc.text(`${isUr ? "کل ادائیگیاں" : "Total Payouts"}: ${money(data.summary.totalPayouts)}`, 14, y + 6);
    doc.text(`${isUr ? "کل نکاسی" : "Total Withdrawn"}: ${money(data.summary.totalWithdrawn)}`, 14, y + 12);

        doc.save(`TDX-Statement-${data.profile.username}.pdf`);
  };

  const exportWord = async () => {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = await import("docx");
    const { saveAs } = await import("file-saver");
    const isUr = lang === "ur";
    const PCT = WidthType.PERCENTAGE;

    const toRows = (rows: string[][]): InstanceType<typeof TableRow>[] =>
      rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ width: { size: 20, type: PCT }, children: [new Paragraph(c)] })) }));

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: isUr ? "بیانیے سرمایہ کاری" : "Investment Statement", bold: true, size: 28 })] }),
          new Paragraph(isUr ? `نام: ${data.profile.full_name}` : `Name: ${data.profile.full_name}`),
          new Paragraph(`@${data.profile.username}`),
          new Paragraph(isUr ? `موبائل: ${data.profile.mobile_number}` : `Mobile: ${data.profile.mobile_number}`),
          new Paragraph(isUr ? `شہر: ${data.profile.city}` : `City: ${data.profile.city}`),
          new Paragraph(""),
          new Paragraph({ children: [new TextRun({ text: isUr ? "ذیبین" : "Deposits", bold: true })] }),
          new Table({ rows: toRows([
            [isUr ? "رقم" : "Amount", isUr ? "اسٹیٹس" : "Status", isUr ? "تاریخ" : "Date"],
            ...data.deposits.map((d) => {
              const dd = d as { amount: number; status: string; created_at: string };
              return [money(dd.amount), dd.status, fmtDate(dd.created_at, lang)];
            }),
          ]) }),
          new Paragraph(""),
          new Paragraph({ children: [new TextRun({ text: isUr ? "ادائیگیاں" : "Payouts", bold: true })] }),
          new Table({ rows: toRows([
            [isUr ? "رقم" : "Amount", "%", isUr ? "ماہ/سال" : "Month/Year", isUr ? "اسٹیٹس" : "Status", isUr ? "تاریخ" : "Date"],
            ...data.payouts.map((p) => {
              const pp = p as { amount: number; percentage_applied: number; month: number; year: number; status: string; created_at: string };
              return [money(pp.amount), `${pp.percentage_applied}%`, `${pp.month}/${pp.year}`, pp.status, fmtDate(pp.created_at, lang)];
            }),
          ]) }),
          new Paragraph(""),
          new Paragraph({ children: [new TextRun({ text: `${isUr ? "کل جمع شدہ" : "Total Deposited"}: ${money(data.summary.totalDeposited)}`, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `${isUr ? "کل ادائیگیاں" : "Total Payouts"}: ${money(data.summary.totalPayouts)}`, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `${isUr ? "کل نکاسی" : "Total Withdrawn"}: ${money(data.summary.totalWithdrawn)}`, bold: true })] }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `TDX-Statement-${data.profile.username}.docx`);
  };

  const exportPNG = async () => {
    const { default: html2canvas } = await import("html2canvas");
    if (!statementRef.current) return;
    const canvas = await html2canvas(statementRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `TDX-Statement-${data.profile.username}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div>
      <div ref={statementRef} className="glass-panel p-6 mb-4" dir={lang === "ur" ? "rtl" : "ltr"}>
        <h2 className="text-xl font-bold mb-4">{t("investmentSummary")}</h2>
        <p className="text-sm text-white/70 mb-1">{t("name")}: {data.profile.full_name}</p>
        <p className="text-sm text-white/70 mb-1">@{data.profile.username} · {data.profile.mobile_number}</p>
        <p className="text-sm text-white/70 mb-1">{t("city")}: {data.profile.city}</p>
        <hr className="border-white/10 my-4" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <span className="text-white/50 text-xs block">{t("totalDeposited")}</span>
            <p className="font-bold">{money(data.summary.totalDeposited)}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("totalProfit")}</span>
            <p className="font-bold">{money(data.summary.totalPayouts)}</p>
          </div>
          <div>
            <span className="text-white/50 text-xs block">{t("totalWithdrawn")}</span>
            <p className="font-bold">{money(data.summary.totalWithdrawn)}</p>
          </div>
        </div>
        <p className="text-xs text-white/50">{t("generatedOn")}: {fmtDate(new Date().toISOString(), lang)}</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button onClick={exportPDF} className="btn-3d-lime px-4 py-2 rounded-xl">{t("exportPdf")}</button>
        <button onClick={exportWord} className="btn-3d-lime px-4 py-2 rounded-xl">{t("exportWord")}</button>
        <button onClick={exportPNG} className="btn-3d-lime px-4 py-2 rounded-xl">{t("exportPng")}</button>
      </div>
    </div>
  );
}

