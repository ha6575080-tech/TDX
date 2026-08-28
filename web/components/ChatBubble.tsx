"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  message_ur?: string | null;
  created_at: string;
}

export default function ChatBubble() {
  const supabase = createClient();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase
      .from("messages")
      .select("id, sender, message, message_ur, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages((data ?? []) as ChatMessage[]);
  }, [supabase]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!userId || !text || sending) return;
      setInput("");
      setSending(true);
      // Clear any prior error before attempting a new send.
      setError(null);
      setMessages((prev) => [
        ...prev,
        { id: `temp-${Date.now()}`, sender: "user", message: text, created_at: new Date().toISOString() },
      ]);

      // Safe, user-facing messages (never expose server internals).
      const genericMsg =
        lang === "ur"
          ? "معذرت، چیٹ سپورٹ عارضی طور پر دستیاب نہیں ہے۔ کچھ دیر بعد دوبارہ کوشش کریں۔"
          : "Sorry, chat support is temporarily unavailable. Please try again in a moment.";
      const sessionMsg =
        lang === "ur"
          ? "آپ کا سیشن ختم ہو گیا ہے۔ براہ کرم پیج ریفریش کریں اور دوبارہ کوشش کریں۔"
          : "Your session may have expired. Please refresh the page and try again.";
      const connMsg =
        lang === "ur"
          ? "نیٹ ورک کنکشن کا مسئلہ پیش آیا۔ براہ کرم دوبارہ کوشش کریں۔"
          : "A network problem occurred. Please try again.";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, message: text, language: lang }),
        });

        let data: { error?: string; mode?: string; reply?: string } | null = null;
        try {
          data = await res.json();
        } catch {
          // Body isn't valid JSON — treat as a generic failure.
          data = null;
        }

        if (!res.ok) {
          // Never show server internals — only the safe messages.
          if (res.status === 401 || res.status === 403) {
            setError(sessionMsg);
          } else {
            setError(genericMsg);
          }
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `reply-${Date.now()}`,
            sender: data?.mode === "ai" ? "ai" : "system",
            message: data?.reply ?? "",
            created_at: new Date().toISOString(),
          },
        ]);
      } catch {
        // Network / fetch failure — not JSON-related, show a connection message.
        setError(connMsg);
      } finally {
        setSending(false);
      }
    },
    [userId, input, sending, lang]
  );

  const clearError = () => setError(null);

  const displayText = (m: ChatMessage) =>
    lang === "ur" && m.message_ur ? m.message_ur : m.message;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          clearError();
        }}
        className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-50 glass-panel rounded-full w-14 h-14 flex items-center justify-center animate-float hover:scale-110 transition-transform cursor-pointer border-primary/50 shadow-[0_0_20px_rgba(208,255,130,0.2)]"
        title={t("globalChat")}
      >
        {open ? <X className="w-6 h-6 text-primary" /> : <MessageCircle className="w-6 h-6 text-primary" />}
        {!open && <span className="absolute top-0 right-0 w-3 h-3 bg-secondary rounded-full border-2 border-surface shadow-[0_0_5px_rgba(233,195,73,0.8)]" />}
      </button>

      {/* Slide-up chat panel */}
      {open && (
        <div className="fixed bottom-40 md:bottom-24 right-4 md:right-6 z-50 w-80 max-h-[60vh] flex flex-col rounded-2xl glass-panel overflow-hidden">
          <div className="p-3 border-b border-outline-variant/30 bg-surface-container-high/50">
            <h3 className="text-label-md text-on-surface font-semibold">{t("globalChat")}</h3>
          </div>
          {error && (
            <div className="border-b border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              {error}
            </div>
          )}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t("noMessages")}</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="flex flex-col">
                  <span className="mb-1 text-xs font-semibold text-on-surface-variant">
                    {m.sender === "user" ? (lang === "ur" ? "آپ" : "You") : m.sender === "admin" ? "Admin" : m.sender === "ai" ? t("aiBot") : "System"}
                  </span>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.sender === "user"
                      ? "bg-primary-container text-on-primary-container"
                      : m.sender === "admin"
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container-high text-on-surface"
                  }`}>
                    {displayText(m)}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="p-2 border-t border-outline-variant/30 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("typeHuman")}
              className="h-10 flex-1 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary"
            />
            <button type="submit" disabled={!input.trim() || sending} className="btn-3d-lime h-10 rounded-lg px-3 text-sm font-bold disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}