"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="h-10 rounded-lg bg-[#A8E636] px-5 text-sm font-bold text-[#0B2E1F] transition-colors hover:bg-[#b8f04a]"
    >
      Logout
    </button>
  );
}