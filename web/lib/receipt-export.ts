export interface ReceiptData {
  type: "deposit" | "payout"; id: string; user: string; mobile: string;
  username: string; city: string; amount: number | null; status: string;
  date: string | null; percentage?: number | null; month?: number | null;
  year?: number | null; language: "en" | "ur";
}
export function receiptFilename(data: ReceiptData, extension: string): string {
  return `TDX-${data.type}-${data.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8)}.${extension}`;
}
export function receiptRows(data: ReceiptData, isUr: boolean): Array<[string, string]> {
  const date = data.date && Number.isFinite(new Date(data.date).getTime())
    ? new Intl.DateTimeFormat(isUr ? "ur-PK" : "en-PK", { timeZone: "Asia/Karachi" }).format(new Date(data.date)) : "—";
  const rows: Array<[string, string]> = [
    [isUr ? "نوع" : "Type", data.type === "deposit" ? (isUr ? "ڈپازٹ" : "DEPOSIT") : (isUr ? "ادائیگی" : "PAYOUT")],
    [isUr ? "صارف" : "Member", data.user], [isUr ? "موبائل" : "Mobile", data.mobile || "—"],
    [isUr ? "صارف نام" : "Username", data.username || "—"], [isUr ? "شہر" : "City", data.city || "—"],
    [isUr ? "رقم" : "Amount", `Rs ${Number(data.amount ?? 0).toLocaleString("en-PK")}`],
    [isUr ? "حالت" : "Status", data.status],
  ];
  if (data.percentage != null && [7, 8, 9, 10].includes(Number(data.percentage))) rows.push([isUr ? "فیصد" : "Percentage", `${data.percentage}%`]);
  rows.push([isUr ? "تاریخ" : "Date", date], ["ID", data.id]);
  return rows;
}

export const RECEIPT_BRAND = {
  name: "TDX Investment", logo: "/Logo.jpg", supportNumber: "0308-3958294",
  stamp: "DIGITALLY SIGNED", signatureNote: "No manual signature required",
} as const;

function loadReceiptLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const logo = new Image();
    const timer = setTimeout(() => reject(new Error("Receipt logo timed out")), 5000);
    logo.onload = () => { clearTimeout(timer); resolve(logo); };
    logo.onerror = () => { clearTimeout(timer); reject(new Error("Receipt logo could not be loaded")); };
    logo.src = RECEIPT_BRAND.logo;
  });
}

/** One print layout is shared by the preview, PNG, PDF, DOCX and native sharing.
 * Browser text shaping preserves Urdu without relying on PDF's built-in fonts. */
export async function createReceiptImage(data: ReceiptData, isUr: boolean): Promise<Blob> {
  const logo = await loadReceiptLogo();
  const rows = receiptRows(data, isUr);
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 1640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable");
  const green = "#173f34", muted = "#63716b", ink = "#172c24", gold = "#b49a58";
  const text = (value: string, x: number, y: number, size: number, color = ink, bold = false, align: CanvasTextAlign = "left", max = 1020, rtl = false) => {
    ctx.direction = rtl ? "rtl" : "ltr"; ctx.textAlign = align; ctx.fillStyle = color;
    let fitted = size; ctx.font = (bold ? "bold " : "") + fitted + "px Arial, sans-serif";
    while (fitted > 16 && ctx.measureText(value).width > max) { fitted--; ctx.font = (bold ? "bold " : "") + fitted + "px Arial, sans-serif"; }
    ctx.fillText(value, x, y, max);
  };
  const line = (y: number) => { ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(1128, y); ctx.strokeStyle = "#dce4df"; ctx.lineWidth = 1; ctx.stroke(); };
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1200, 1640);
  ctx.strokeStyle = "#d9e2dc"; ctx.lineWidth = 2; ctx.strokeRect(30, 30, 1140, 1580);
  ctx.fillStyle = green; ctx.fillRect(30, 30, 1140, 218);
  ctx.fillStyle = gold; ctx.fillRect(30, 244, 1140, 4);
  ctx.drawImage(logo, 70, 64, 142, 142);
  text("TDX INVESTMENT", 240, 124, 43, "#fff", true, "left", 830);
  text(isUr ? "ٹرانزیکشن رسید" : "TRANSACTION RECEIPT", 240, 173, 23, "#d6e4dd", false, "left", 830, isUr);
  text(isUr ? "حوالہ نمبر" : "TRANSACTION REFERENCE", 72, 295, 18, muted, true);
  text(data.id, 72, 330, 25, ink, true);

  ctx.fillStyle = "#eef4f0"; ctx.fillRect(72, 366, 1056, 170);
  ctx.fillStyle = green; ctx.fillRect(72, 366, 6, 170);
  text(isUr ? "رقم پاکستانی روپے" : "AMOUNT  /  PKR", 104, 412, 21, muted, true, "left", 980, isUr);
  text(data.amount == null || !Number.isFinite(Number(data.amount)) ? "—" : Number(data.amount).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 104, 492, 68, green, true, "left", 980);

  text(isUr ? "ممبر کی تفصیلات" : "MEMBER DETAILS", 72, 593, 20, green, true, "left", 1020, isUr);
  const memberRows = rows.slice(1, 5);
  memberRows.forEach(([label, value], index) => {
    const x = index % 2 === 0 ? 72 : 625, y = 641 + Math.floor(index / 2) * 102;
    text(label, x, y, 19, muted, false, "left", 480, isUr);
    text(value, x, y + 37, 28, ink, true, "left", 480, isUr && !/^[0-9+ -]+$/.test(value));
  });
  line(810);
  const detailRows = [rows[0], ...rows.slice(6).filter(([label]) => label !== "ID")];
  detailRows.forEach(([label, value], index) => {
    const y = 859 + index * 60;
    text(label, 72, y, 22, muted, false, "left", 400, isUr);
    text(value, 1128, y, 25, ink, true, "right", 620, isUr && !/^[0-9/%: .-]+$/.test(value));
  });
  line(1164);
  text(isUr ? "مدد اور رابطہ" : "SUPPORT & ASSISTANCE", 72, 1230, 19, muted, true, "left", 650, isUr);
  text(RECEIPT_BRAND.supportNumber, 72, 1273, 32, green, true, "left", 650);
  text("tdx-plum.vercel.app", 72, 1315, 22, muted, false, "left", 650);

  ctx.save(); ctx.translate(968, 1305); ctx.rotate(-0.10);
  ctx.strokeStyle = green; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 96, 0, Math.PI * 2); ctx.stroke();
  text(RECEIPT_BRAND.stamp, 0, -35, 17, green, true, "center", 178);
  text("TDX", 0, 19, 43, green, true, "center", 178);
  text("ELECTRONIC RECEIPT", 0, 56, 13, green, true, "center", 172);
  ctx.restore();
  text(isUr ? "دستی دستخط کی ضرورت نہیں" : RECEIPT_BRAND.signatureNote, 600, 1476, 24, green, true, "center", 1020, isUr);
  text(isUr ? "یہ کمپیوٹر سے جاری کردہ رسید ہے۔ اوپر درج ٹرانزیکشن کی حیثیت دیکھیں۔" : "Computer-generated receipt. Please refer to the transaction status shown above.", 600, 1526, 19, muted, false, "center", 1020, isUr);
  text(RECEIPT_BRAND.name + "  •  " + RECEIPT_BRAND.supportNumber, 600, 1578, 17, muted, false, "center", 1020);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png"));
}

export async function receiptPdf(image: Blob): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ compress: true });
  const bytes = new Uint8Array(await image.arrayBuffer());
  const dimensions = pdf.getImageProperties(bytes);
  const width = Math.min(180, 267 * dimensions.width / dimensions.height);
  pdf.addImage(bytes, "PNG", (210 - width) / 2, 15, width, width * dimensions.height / dimensions.width);
  return pdf.output("blob");
}

export async function receiptWord(data: ReceiptData, image: Blob): Promise<Blob> {
  const { Document, Packer, Paragraph, ImageRun, AlignmentType } = await import("docx");
  const description = receiptRows(data, data.language === "ur").map(([label, value]) => label + ": " + value).join(". ") + ". Support: " + RECEIPT_BRAND.supportNumber + ". " + RECEIPT_BRAND.stamp + ". " + RECEIPT_BRAND.signatureNote;
  const document = new Document({ creator: RECEIPT_BRAND.name, title: "TDX Transaction Receipt", sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: new Uint8Array(await image.arrayBuffer()), transformation: { width: 660, height: 902 }, altText: { title: "TDX transaction receipt", description, name: receiptFilename(data, "png") } })] })] }] });
  return Packer.toBlob(document);
}

export const RECEIPT_SHARE_TARGETS = ["WhatsApp", "Facebook", "Instagram", "TikTok", "Email"] as const;
export type ReceiptShareTarget = typeof RECEIPT_SHARE_TARGETS[number];
export const RECEIPT_SHARE_DESTINATIONS: Record<ReceiptShareTarget, string> = {
  WhatsApp: "https://wa.me/?text=TDX%20receipt%20attached", Facebook: "https://www.facebook.com/",
  Instagram: "https://www.instagram.com/", TikTok: "https://www.tiktok.com/",
  Email: "mailto:?subject=TDX%20Receipt&body=Please%20attach%20the%20downloaded%20TDX%20receipt%20image.",
};
export async function shareReceiptFile(file: File, share: Pick<Navigator, "canShare" | "share">): Promise<"shared" | "unsupported" | "cancelled"> {
  try {
    if (!share.share || !share.canShare?.({ files: [file] })) return "unsupported";
    await share.share({ files: [file], title: "TDX Receipt" }); return "shared";
  }
  catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
