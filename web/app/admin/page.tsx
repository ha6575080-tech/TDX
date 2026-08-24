import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "./AdminPanel";

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

export default async function AdminPage() {
  if (!envIsConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Server-side guard: only role='admin' may access this page.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return <AdminPanel />;
}