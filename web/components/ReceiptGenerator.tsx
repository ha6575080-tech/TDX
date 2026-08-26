"use client";

import { useRef } from "react";
import { useI18n } from "@/lib/i18n";

export interface ReceiptData {
  type: "deposit" | "payout";
  id: string;
  user: string;
  mobile: string;
  username: string;
  city: string;
  amount: number | null;
  status: string;
  date: string | null;
  percentage?: number | null;
  month?: number | null;
  year?: number | null;
  language: "en" | "ur";
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : "—";
}

export default function ReceiptGenerator({ data }: { data: ReceiptData }) {
  const { t, lang } = useI18n();
  const receiptRef = useRef<HTMLDivElement>(null);
  const isUr = lang === "ur";

  const handlePdf = async () => {
    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("TDX Investment", 105, 20, { align: "center" });
    doc.setFontSize(14);
    doc.text(isUr ? "رسید" : "RECEIPT", 105, 30, { align: "center" });
    doc.setFontSize(10);
    doc.text(`${isUr ? "نوع" : "Type"}: ${data.type.toUpperCase()}`, 14, 45);
    doc.text(`${isUr ? "صارف" : "User"}: ${data.user}`, 14, 52);
    doc.text(`${isUr ? "موبائل" : "Mobile"}: ${data.mobile}`, 14, 59);
    doc.text(`${isUr ? "صارف نام" : "Username"}: ${data.username}`, 14, 66);
    doc.text(`${isUr ? "شہر" : "City"}: ${data.city}`, 14, 73);
    doc.text(`${isUr ? "رقم" : "Amount"}: Rs ${(data.amount ?? 0).toLocaleString()}`, 14, 80);
    doc.text(`${isUr ? "حالت" : "Status"}: ${data.status}`, 14, 87);
    if (data.percentage) {
      doc.text(`${isUr ? "فیصد" : "Percentage"}: ${data.percentage}%`, 14, 94);
    }
    doc.text(`${isUr ? "تاریخ" : "Date"}: ${fmtDate(data.date)}`, 14, 101);
    doc.text(`ID: ${data.id}`, 14, 108);
    doc.setFontSize(8);
    doc.text(isUr ? "یہ خودکار طریقے سے تیار کردہ رسید ہے۔" : "This is a system-generated receipt.", 105, 120, { align: "center" });
    doc.save(`TDX-${data.type}-${data.id.slice(0, 8)}.pdf`);
  };

  const handleWord = async () => {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");
    const { saveAs } = await import("file-saver");
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: "TDX Investment", bold: true, size: 36 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun({ text: isUr ? "رسید" : "RECEIPT", bold: true, size: 28 })], alignment: AlignmentType.CENTER }),
          new Paragraph({ children: [new TextRun("")] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "نوع" : "Type"}: ${data.type.toUpperCase()}`)] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "صارف" : "User"}: ${data.user}`)] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "موبائل" : "Mobile"}: ${data.mobile}`)] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "رقم" : "Amount"}: Rs ${(data.amount ?? 0).toLocaleString()}`)] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "حالت" : "Status"}: ${data.status}`)] }),
          new Paragraph({ children: [new TextRun(`${isUr ? "تاریخ" : "Date"}: ${fmtDate(data.date)}`)] }),
          new Paragraph({ children: [new TextRun(`ID: ${data.id}`)] }),
        ],
      }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `TDX-${data.type}-${data.id.slice(0, 8)}.docx`);
  };

  const handlePng = async () => {
    if (!receiptRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(receiptRef.current);
    const link = document.createElement("a");
    link.download = `TDX-${data.type}-${data.id.slice(0, 8)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div>
      <div ref={receiptRef} className="glass-panel p-6 max-w-md mx-auto">
        <h2 className="text-xl font-bold text-center mb-4">TDX Investment</h2>
        <h3 className="text-lg font-semibold text-center mb-4">{isUr ? "رسید" : "RECEIPT"}</h3>
        <div className="space-y-2 text-sm">
          <p><strong>{isUr ? "نوع" : "Type"}:</strong> {data.type.toUpperCase()}</p>
          <p><strong>{isUr ? "صارف" : "User"}:</strong> {data.user}</p>
          <p><strong>{isUr ? "موبائل" : "Mobile"}:</strong> {data.mobile}</p>
          <p><strong>{isUr ? "صارف نام" : "Username"}:</strong> {data.username}</p>
          <p><strong>{isUr ? "شہر" : "City"}:</strong> {data.city}</p>
          <p><strong>{isUr ? "رقم" : "Amount"}:</strong> Rs {(data.amount ?? 0).toLocaleString()}</p>
          <p><strong>{isUr ? "حالت" : "Status"}:</strong> {data.status}</p>
          {data.percentage && <p><strong>{isUr ? "فیصد" : "Percentage"}:</strong> {data.percentage}%</p>}
          <p><strong>{isUr ? "تاریخ" : "Date"}:</strong> {fmtDate(data.date)}</p>
          <p className="text-xs text-white/50">ID: {data.id}</p>
        </div>
      </div>
      <div className="flex gap-3 justify-center mt-4">
        <button onClick={handlePdf} className="btn-3d-lime px-4 py-2">{t("downloadPdf")}</button>
        <button onClick={handleWord} className="btn-3d-lime px-4 py-2">{t("downloadWord")}</button>
        <button onClick={handlePng} className="btn-3d-lime px-4 py-2">{t("downloadPng")}</button>
      </div>
    </div>
  );
}
