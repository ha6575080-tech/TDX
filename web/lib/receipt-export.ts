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

/** Native text shaping preserves Urdu in exported PNG/PDF and avoids
 * screenshot-library failures on modern CSS color functions. */
export async function createReceiptImage(data: ReceiptData, isUr: boolean): Promise<Blob> {
  const rows = receiptRows(data, isUr);
  const canvas = document.createElement("canvas");
  canvas.width = 1000; canvas.height = 230 + rows.length * 100;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#103e2c"; context.fillRect(0, 0, canvas.width, 170);
  context.textAlign = "center"; context.fillStyle = "#ffffff";
  context.font = "bold 46px Arial, sans-serif"; context.fillText("TDX Investment", 500, 67);
  context.font = "30px Arial, sans-serif"; context.fillText(isUr ? "رسید" : "RECEIPT", 500, 125);
  rows.forEach(([label, value], index) => {
    const y = 215 + index * 100;
    context.direction = isUr ? "rtl" : "ltr"; context.textAlign = isUr ? "right" : "left";
    const x = isUr ? 940 : 60;
    context.fillStyle = "#4b6358"; context.font = "24px Arial, sans-serif"; context.fillText(label, x, y);
    context.fillStyle = "#12251b";
    let size = 32; context.font = `${size}px Arial, sans-serif`;
    while (size > 14 && context.measureText(value).width > 880) context.font = `${--size}px Arial, sans-serif`;
    context.fillText(value, x, y + 42, 880);
    context.strokeStyle = "#e1e9e4"; context.beginPath(); context.moveTo(60, y + 65); context.lineTo(940, y + 65); context.stroke();
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png"));
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
