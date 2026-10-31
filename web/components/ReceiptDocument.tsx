"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { createReceiptImage, receiptFilename, receiptRows, receiptPdf, receiptWord, shareReceiptFile, RECEIPT_SHARE_DESTINATIONS, RECEIPT_SHARE_TARGETS, type ReceiptData, type ReceiptShareTarget } from "@/lib/receipt-export";

function saveFile(file: Blob, filename: string) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function ReceiptDocument({ data }: { data: ReceiptData }) {
  const { t } = useI18n();
  const isUr = data.language === "ur";
  const [busy, setBusy] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ data: ReceiptData; file: File; url: string } | null>(null);
  const file = prepared?.data === data ? prepared.file : null;

  useEffect(() => {
    let active = true;
    let previewUrl: string | undefined;
    createReceiptImage(data, isUr).then((image) => {
      if (active) {
        previewUrl = URL.createObjectURL(image);
        setError("");
        setPrepared({ data, file: new File([image], receiptFilename(data, "png"), { type: "image/png" }), url: previewUrl });
      }
    }).catch(() => { if (active) setError(isUr ? "رسید کی تصویر تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔" : "Could not prepare the receipt image. Please try again."); });
    return () => { active = false; if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [data, isUr]);

  async function exportFile(format: "pdf" | "docx" | "png") {
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!file) throw new Error("Receipt not ready");
      const image = format === "docx" ? await receiptWord(data, file) : format === "pdf" ? await receiptPdf(file) : file;
      saveFile(image, receiptFilename(data, format));
    } catch { setError(isUr ? "فائل محفوظ نہیں ہو سکی۔ دوبارہ کوشش کریں۔" : "Could not save the receipt. Please try again."); }
    finally { setBusy(false); }
  }

  async function shareTo(target: ReceiptShareTarget) {
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
    // Pre-rendering keeps native sharing within the click's user activation.
    const result = await shareReceiptFile(file, navigator);
    if (result === "cancelled") return;
    if (result === "shared") { setNotice(isUr ? "اشتراک کا مینو کھل گیا۔ ایپ اور وصول کنندہ منتخب کریں۔" : "Sharing menu opened. Choose your app and recipient."); return; }
    saveFile(file, file.name);
    setNotice(isUr ? `رسید محفوظ ہو گئی۔ ${target} کھول کر تصویر منسلک کریں۔` : `Receipt saved. Open ${target} below and attach the downloaded image.`);
    } catch { setError(isUr ? "رسید شیئر نہیں ہو سکی۔ دوبارہ کوشش کریں۔" : "Could not share the receipt. Please try again."); }
    finally { setBusy(false); }
  }

  return <div>

    <div className="flex flex-wrap gap-3 justify-center mt-4 print:hidden">
      <button disabled={!file || busy} onClick={() => exportFile("pdf")} className="btn-3d-lime px-4 py-2 disabled:opacity-50">{t("downloadPdf")}</button>
      <button disabled={!file || busy} onClick={() => exportFile("docx")} className="btn-3d-lime px-4 py-2 disabled:opacity-50">{t("downloadWord")}</button>
      <button disabled={!file || busy} onClick={() => exportFile("png")} className="btn-3d-lime px-4 py-2 disabled:opacity-50">{t("downloadPng")}</button>
      <button type="button" aria-expanded={showShare} disabled={!file || busy} onClick={() => setShowShare(!showShare)} className="btn-3d-lime px-4 py-2 flex items-center gap-2 disabled:opacity-50"><Share2 size={18} />{isUr ? "رسید شیئر کریں" : "Share receipt"}</button>
    </div>
    {busy && <p role="status" className="text-sm text-center mt-3">{isUr ? "فائل تیار ہو رہی ہے…" : "Preparing your file…"}</p>}
    {showShare && <div className="glass-panel p-4 mt-4 space-y-3 print:hidden">
      <p className="text-sm">{isUr ? "اپنے فون کے مینو سے ایپ منتخب کریں۔ اگر اشتراک دستیاب نہ ہو تو تصویر محفوظ کر کے منسلک کریں۔" : "Choose an app in your device’s sharing menu. If file sharing is unavailable, save the image and attach it in the app."}</p>
      <div className="flex flex-wrap gap-2">{RECEIPT_SHARE_TARGETS.map((target) => <button key={target} type="button" onClick={() => shareTo(target)} disabled={!file || busy} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50">{target}</button>)}</div>
      {notice && <div className="flex flex-wrap gap-3">{RECEIPT_SHARE_TARGETS.map((target) => <a key={target} href={RECEIPT_SHARE_DESTINATIONS[target]} target={target === "Email" ? undefined : "_blank"} rel="noopener noreferrer" className="text-sm underline">{isUr ? "کھولیں" : "Open"} {target}</a>)}</div>}
    </div>}
    {notice && <p role="status" className="text-sm mt-3">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-400 mt-3">{error}</p>}
    <div className="max-w-xl mx-auto bg-white rounded-lg overflow-hidden shadow-xl">
      {prepared?.data === data ? <Image src={prepared.url} width={1200} height={1640} unoptimized alt={isUr ? "ٹی ڈی ایکس ٹرانزیکشن رسید" : "TDX transaction receipt"} className="w-full h-auto" /> : <p role="status" className="text-green-950 text-center p-8">{isUr ? "رسید تیار ہو رہی ہے…" : "Preparing receipt…"}</p>}
      <dl className="sr-only">{receiptRows(data, isUr).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  </div>;
}
