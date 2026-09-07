"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User, Settings, MessageCircle, LogOut, ChevronDown } from "lucide-react";

interface ProfileMini {
  username: string;
  full_name: string;
  role: string;
}

export default function UserDropdown() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileMini | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);
      const { data } = await supabase.from("profiles").select("username, full_name, role").eq("id", user.id).single();
      if (data) setProfile(data as ProfileMini);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    await supabase.auth.signOut();
    // Clear stale UI: push to login/public and refresh
    router.push("/login");
    router.refresh();
  }

  const displayName = profile?.full_name ?? profile?.username ?? "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-sm text-on-surface transition-colors hover:bg-surface-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">
          {initial}
        </span>
        <span className="hidden max-w-[120px] truncate text-label-md font-medium sm:block">{displayName}</span>
        <ChevronDown className={`hidden h-4 w-4 text-on-surface-variant transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-highest p-2 shadow-xl shadow-primary/10 sm:w-72"
          style={{ maxWidth: "calc(100vw - 1rem)" }}
        >
          {/* Header */}
          <div className="mb-1 rounded-lg bg-surface-container-low px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-on-surface">{displayName}</p>
            {profile?.username && <p className="truncate text-xs text-on-surface-variant">@{profile.username}</p>}
            {email && <p className="truncate text-xs text-on-surface-variant/70">{email}</p>}
            {profile?.role && <p className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{profile.role}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface hover:bg-surface-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <User className="h-4 w-4 text-primary" />
              Profile
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface hover:bg-surface-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Settings className="h-4 w-4 text-primary" />
              Settings
            </Link>
            <Link
              href="/chat"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface hover:bg-surface-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <MessageCircle className="h-4 w-4 text-primary" />
              Contact Support
            </Link>
            <div className="my-1 border-t border-outline-variant/20" />
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
