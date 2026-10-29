import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import ReceiptGenerator from "@/components/ReceiptGenerator";

export default async function InvoicePage({ params }: { params: Promise<{ depositId: string }> }) {
  const { depositId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewer, error: viewerError } = await supabase.from("profiles").select("role, is_suspended").eq("id", user.id).single();
  if (viewerError || !viewer) throw new Error("Could not verify your account.");
  const isAdmin = viewer.role === "admin";
  if (!isAdmin && viewer.is_suspended) redirect("/dashboard");
  const admin = await createServiceRoleClient();
  let query = admin.from("deposits").select("id, user_id, amount, status, uploaded_at, approved_at").eq("id", depositId);
  if (!isAdmin) query = query.eq("user_id", user.id);
  const { data: deposit, error } = await query.single();
  if (error || !deposit) notFound();
  const { data: member, error: memberError } = await admin.from("profiles").select("full_name, username, city, mobile_number").eq("id", deposit.user_id).single();
  if (memberError || !member) throw new Error("Could not load receipt details.");
  const language = (await cookies()).get("locale")?.value === "en" ? "en" : "ur";
  return <main className="min-h-screen bg-base text-on-surface py-8 print:bg-white print:p-0">
    <div className="mx-auto max-w-3xl px-4 print:px-0">
      <div className="mb-6 flex items-center justify-between print:hidden"><h1 className="text-2xl font-bold">TDX Receipt</h1><PrintButton /></div>
      <ReceiptGenerator data={{ type: "deposit", id: deposit.id, user: member.full_name ?? member.username ?? "—", username: member.username ?? "—", mobile: member.mobile_number ?? "—", city: member.city ?? "—", amount: Number(deposit.amount), status: deposit.status, date: deposit.uploaded_at, language }} />
      <p className="mt-6 text-center text-sm print:hidden"><Link href={isAdmin ? "/admin" : "/dashboard"} className="text-primary hover:underline">← Back to TDX</Link></p>
    </div>
  </main>;
}
