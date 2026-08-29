"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Notification {
  id: string;
  title: string;
  message: string;
  title_ur?: string | null;
  message_ur?: string | null;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json();
    setNotifications(data.notifications ?? []);
    setUnread((data.notifications ?? []).filter((n: Notification) => !n.is_read).length);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_id: id }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }, []);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `${t("notificationBell")} (${unread} unread)` : t("notificationBell")}
        aria-expanded={open}
        className="relative p-2 text-on-surface-variant hover:bg-surface-bright rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        title={t("notificationBell")}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto custom-scrollbar rounded-xl glass-panel p-3 z-50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-label-md text-on-surface font-semibold">
              {t("notificationBell")}
            </h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("noNotifications")}</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  aria-label={`${lang === "ur" && n.title_ur ? n.title_ur : n.title} — mark as read`}
                  className={`w-full text-left rounded-lg p-3 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    n.is_read
                      ? "bg-surface-container-low border-outline-variant/20"
                      : "bg-surface-container-high border-primary/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-on-surface">
                    {lang === "ur" && n.title_ur ? n.title_ur : n.title}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {lang === "ur" && n.message_ur ? n.message_ur : n.message}
                  </p>
                  <p className="text-xs text-on-surface-variant/60 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}