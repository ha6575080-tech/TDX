"use client";

import FinancialSimulator from "@/components/FinancialSimulator";
import { TopNav, BottomNav } from "@/components/ui";

export default function SimulatorPage() {
  return (
    <div className="min-h-screen bg-surface">
      <TopNav active="simulator" />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24">
        <FinancialSimulator />
      </main>
      <BottomNav active="simulator" />
    </div>
  );
}