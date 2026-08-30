"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ListChecks,
  BarChart3,
  MessageCircle,
  History,
  Target,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import NotificationBell from "@/components/NotificationBell";

/* ===== GlassPanel ===== */
export function GlassPanel({
  children,
  className = "",
  glow = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={`glass-panel rounded-xl ${glow ? "glow-border-lime" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ===== GlowButton (3D lime/gold) ===== */
export function GlowButton({
  children,
  variant = "lime",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "lime" | "gold" | "danger";
}) {
  const cls =
    variant === "lime"
      ? "btn-3d-lime"
      : variant === "gold"
      ? "btn-3d-gold"
      : "btn-danger-3d";
  return (
    <button
      className={`h-[56px] rounded-xl px-6 font-bold flex items-center justify-center gap-2 ${cls} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ===== StatTile ===== */
export function StatTile({
  icon,
  label,
  value,
  sub,
  accent = "lime",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "lime" | "gold" | "mint";
}) {
  const iconColor =
    accent === "lime"
      ? "text-primary"
      : accent === "gold"
      ? "text-secondary"
      : "text-tertiary";
  return (
    <GlassPanel glow className="p-4 flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
        <span className={iconColor}>{icon}</span>
        {sub && (
          <span className="bg-primary/10 rounded-full px-2 py-0.5 border border-primary/20 text-label-sm text-primary">
            {sub}
          </span>
        )}
      </div>
      <div>
        <div className="text-label-sm text-on-surface-variant mb-1">{label}</div>
        <div className="text-title-md text-on-surface font-bold">{value}</div>
      </div>
    </GlassPanel>
  );
}

/* ===== FeedItem ===== */
export function FeedItem({
  icon,
  title,
  meta,
  accent = "lime",
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  meta: string;
  accent?: "lime" | "gold" | "mint";
}) {
  const border =
    accent === "lime"
      ? "border-l-primary"
      : accent === "gold"
      ? "border-l-secondary"
      : "border-l-tertiary";
  return (
    <div className={`bg-surface-container-low rounded-lg p-2 border-l-2 ${border} flex items-start gap-2`}>
      <div className="w-8 h-8 rounded-full bg-surface-bright flex items-center justify-center shrink-0 text-on-surface-variant">
        {icon}
      </div>
      <div>
        <p className="text-label-md text-on-surface">{title}</p>
        <p className="text-label-sm text-on-surface-variant mt-1">{meta}</p>
      </div>
    </div>
  );
}

/* ===== Gauge ===== */
export function Gauge({
  percent,
  label,
  value,
  color = "lime",
}: {
  percent: number;
  label: string;
  value: string;
  color?: "lime" | "gold";
}) {
  const circumference = 283;
  const offset = circumference - (percent / 100) * circumference;
  const gradId = color === "lime" ? "lime-gradient" : "goldGradient";
  const textColor = color === "lime" ? "text-primary" : "text-secondary";
  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <defs>
          <linearGradient id={gradId} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={color === "lime" ? "#b7f646" : "#ffe088"}
            />
            <stop
              offset="100%"
              stopColor={color === "lime" ? "#9cd927" : "#af8d11"}
            />
          </linearGradient>
        </defs>
        <circle
          className="gauge-track"
          cx="50"
          cy="50"
          fill="none"
          r="45"
          strokeWidth="8"
        />
        <circle
          className="gauge-fill"
          cx="50"
          cy="50"
          fill="none"
          r="45"
          strokeLinecap="round"
          strokeWidth="8"
          stroke={`url(#${gradId})`}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-headline-lg font-bold ${textColor}`}>{value}</span>
        <span className="text-label-sm text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
}

/* ===== LanguageToggle ===== */
export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const options: { code: "en" | "ur" | "sd"; label: string }[] = [
    { code: "en", label: "English" },
    { code: "ur", label: "اردو" },
    { code: "sd", label: "سنڌي" },
  ];
  return (
    <div
      className="h-9 rounded-full border border-outline-variant/50 bg-surface-container-low flex items-center p-0.5"
      title="Select language"
    >
      {options.map((o) => (
        <button
          key={o.code}
          type="button"
          onClick={() => setLang(o.code)}
          className={`h-8 px-2.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
            lang === o.code
              ? "bg-primary text-on-primary"
              : "text-on-surface-variant hover:text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ===== TopNav ===== */
export function TopNav({ active }: { active?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const links = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/activity", label: "Activity" },
    { href: "/goals", label: "Goals" },
    { href: "/tasks", label: t("tasks") },
    { href: "/statistics", label: t("stats") },
    { href: "/chat", label: t("chat") },
  ];
  return (
    <nav className="hidden md:flex justify-between items-center px-container-padding h-16 w-full max-w-7xl mx-auto bg-surface/80 backdrop-blur-xl fixed top-0 z-50 border-b border-outline-variant/30 shadow-md shadow-primary/10">
      <Link href="/" className="text-headline-lg font-bold text-primary tracking-tighter">
        {t("appName")}
      </Link>
      <div className="flex gap-4 text-label-md">
        {links.map((l) => {
          const isActive = active === l.href || pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "text-secondary font-bold"
                  : "text-on-surface-variant hover:bg-surface-bright"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="flex gap-2 items-center">
        <NotificationBell />
        <LanguageToggle />
        <LogoutButton />
      </div>
    </nav>
  );
}

/* ===== BottomNav ===== */
export function BottomNav({ active }: { active?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: t("home"), icon: <Home className="w-5 h-5" /> },
    { href: "/activity", label: "Activity", icon: <History className="w-5 h-5" /> },
    { href: "/goals", label: "Goals", icon: <Target className="w-5 h-5" /> },
    { href: "/tasks", label: t("tasks"), icon: <ListChecks className="w-5 h-5" /> },
    { href: "/chat", label: t("chat"), icon: <MessageCircle className="w-5 h-5" /> },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-surface-container-highest/90 backdrop-blur-lg rounded-t-xl shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
      {items.map((item) => {
        const isActive = active === item.href || pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center px-4 py-2 transition-all ${
              isActive
                ? "bg-primary-container text-on-primary-container rounded-xl shadow-[0_0_15px_rgba(156,217,39,0.4)] scale-110"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            {item.icon}
            <span className="text-label-sm mt-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ===== LogoutButton (re-export for TopNav) ===== */
import LogoutButton from "@/components/LogoutButton";
export { LogoutButton };