"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-lg bg-[#A8E636] px-4 text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a]"
    >
      Print
    </button>
  );
}