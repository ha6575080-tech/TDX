"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePushNotifications() {
  const supabase = createClient();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

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
      setPermission("granted");
      return true;
    } catch {
      return false;
    }
  }, [supported, supabase]);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      return subscribe();
    }
    return false;
  }, [supported, subscribe]);

  return { supported, permission, requestPermission, subscribe };
}