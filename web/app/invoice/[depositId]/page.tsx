import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";

function envIsConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const urlOk = url.startsWith("https://") && !url.includes("PLACEHOLDER");
  const keyOk =
    anonKey.length > 10 &&
    anonKey !== "PASTE_ANON_KEY_HERE" &&
    anonKey !== "your-anon-key" &&
    !anonKey.includes("YOUR");
  return urlOk && keyOk;
}

function fmtPKR(n: number | null | undefined): string {
  const amount = Number(n ?? 0);
  return `${amount.toLocaleString("en-PK")} PKR`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  if (!envIsConfigured()) {
    redirect("/login");
  }

  const { depositId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const serviceRole = await createServiceRoleClient();

  const { data: deposit, error } = await serviceRole
    .from("deposits")
    .select(
      "id, user_id, amount, uploaded_at, approved_at, profiles(full_name, city, mobile_number, payment_method, address)"
    )
    .eq("id", depositId)
    .single();

  if (error || !deposit) {
    return (
      <main className="min-h-screen bg-base px-4 py-12 text-on-surface">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-error">Invoice not found</h1>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-primary hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = (deposit as any).user_id === user.id;
  const isAdmin = myProfile?.role === "admin";
  if (!isOwner && !isAdmin) {
    redirect("/dashboard");
  }

  const profile = (deposit as any).profiles;

  const profitStart = deposit.approved_at ?? deposit.uploaded_at;
  const profitEnd = new Date(
    new Date(profitStart).getFullYear() + 1,
    new Date(profitStart).getMonth(),
    new Date(profitStart).getDate()
  );

  return (
    <main className="min-h-screen bg-base text-on-surface py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="TDX Logo"
              className="h-10 w-10 rounded-full object-cover"
            />
            <h1 className="text-2xl font-bold">
              <span className="text-primary">Investment</span>{" "}
              <span className="text-secondary">Invoice</span>
            </h1>
          </div>
          <PrintButton />
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          <div className="mb-6 border-b border-outline-variant/30 pb-4">
            <p className="text-xs uppercase tracking-wide text-on-surface-variant">
              Invoice #
            </p>
            <p className="font-bold text-on-surface">{depositId}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Full Name
              </p>
              <p className="font-semibold text-on-surface">
                {profile?.full_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                City
              </p>
              <p className="font-semibold text-on-surface">
                {profile?.city ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Contact Number
              </p>
              <p className="font-semibold text-on-surface">
                {profile?.mobile_number ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Payment Channel
              </p>
              <p className="font-semibold text-on-surface">
                {profile?.payment_method ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Address
              </p>
              <p className="font-semibold text-on-surface">
                {profile?.address ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-outline-variant/30 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Profit Start Date
              </p>
              <p className="font-semibold text-on-surface">
                {fmtDate(profitStart)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Profit End Date (1 year)
              </p>
              <p className="font-semibold text-on-surface">
                {fmtDate(profitEnd.toISOString())}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Monthly Profit %
              </p>
              <p className="font-semibold text-secondary">7% – 10%</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                Profit Rate
              </p>
              <p className="font-semibold text-secondary">
                Selected by Super Admin at each monthly withdrawal
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-surface-container-low p-4">
            <p className="text-xs uppercase tracking-wide text-on-surface-variant">
              Deposited Amount
            </p>
            <p className="text-2xl font-bold text-primary">
              {fmtPKR(deposit.amount)}
            </p>
          </div>

          <div className="mt-6 rounded-lg bg-secondary/10 p-4 text-sm text-on-surface-variant">
            <p className="font-semibold text-secondary">Terms & Conditions:</p>
            <p className="mt-2">
              In case of complete investment return, the user can request their
              investment back. Once approved, the investment amount will be
              returned to the same account used for deposit within 45 working
              days. Saturday and Sunday are off days and do not count.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          <Link href="/dashboard" className="text-primary hover:underline">
            ← Back to Dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}