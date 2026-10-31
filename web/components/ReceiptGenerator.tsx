"use client";
import ReceiptDocument from "./ReceiptDocument";
import type { ReceiptData } from "@/lib/receipt-export";
export default function ReceiptGenerator({ data }: { data: ReceiptData }) {
  return <ReceiptDocument key={JSON.stringify(data)} data={data} />;
}
export type { ReceiptData } from "@/lib/receipt-export";
