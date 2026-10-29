"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const supportsPush = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
const permissionSnapshot = (): NotificationPermission => supportsPush() ? Notification.permission : "default";
const serverPermission = (): NotificationPermission => "default";
function subscribePermission(notify: () => void) {
  window.addEventListener("focus", notify);
  window.addEventListener("tdx:push-permission", notify);
  return () => { window.removeEventListener("focus", notify); window.removeEventListener("tdx:push-permission", notify); };
}
const serverSupport = () => false;
function refreshPermission() { window.dispatchEvent(new Event("tdx:push-permission")); }

export function usePushNotifications() {
  const supabase = useMemo(() => createClient(), []);
  const supported = useSyncExternalStore(subscribePermission, supportsPush, serverSupport);
  const permission = useSyncExternalStore(subscribePermission, permissionSnapshot, serverPermission);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      // The session is the identity — the server derives the user_id itself.
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) return false;
      refreshPermission();
      return true;
    } catch {
      return false;
    }
  }, [supported, supabase]);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    const result = await Notification.requestPermission();
    refreshPermission();
    if (result === "granted") {
      return subscribe();
    }
    return false;
  }, [supported, subscribe]);

  return { supported, permission, requestPermission, subscribe };
}
