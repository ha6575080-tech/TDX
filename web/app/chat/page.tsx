"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { TopNav, BottomNav, GlassPanel, GlowButton } from "@/components/ui";

interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  message_ur?: string | null;
  created_at: string;
}

export default function ChatPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, lang } = useI18n();

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const { data, error } = await supabase
        .from("messages")
        .select("id, sender, message, message_ur, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages((data ?? []) as ChatMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userId || !input.trim() || sending) return;

      const text = input.trim();
      setInput("");
      setSending(true);
      setError(null);

      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        sender: "user",
        message: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, message: text, language: lang }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to send message");

        const replyMsg: ChatMessage = {
          id: `reply-${Date.now()}`,
          sender: data.mode === "ai" ? "ai" : "system",
          message: data.reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, replyMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message.");
      } finally {
        setSending(false);
      }
    },
    [userId, input, sending]
  );

  const displayText = (m: ChatMessage) =>
    lang === "ur" && m.message_ur ? m.message_ur : m.message;

  const senderLabel = (sender: string) => {
    switch (sender) {
      case "user":
        return lang === "ur" ? "آپ" : lang === "sd" ? "توهان" : "You";
      case "ai":
        return t("aiBot");
      case "admin":
        return lang === "ur" ? "ایڈمن" : "Admin";
      case "system":
        return lang === "ur" ? "سسٹم" : "System";
      default:
        return sender;
    }
  };

  const senderColor = (sender: string) => {
    switch (sender) {
      case "user":
        return "bg-primary-container text-on-primary-container";
      case "ai":
        return "bg-surface-container-high text-on-surface";
      case "admin":
        return "bg-secondary text-on-secondary";
      case "system":
        return "bg-surface-container-high text-on-surface border border-secondary/40";
      default:
        return "bg-surface-bright text-on-surface";
    }
  };

  return (
    <main className="min-h-screen bg-base text-on-surface pb-24 md:pb-0 md:pt-20">
      <TopNav active="/chat" />
      <BottomNav active="/chat" />

      <div className="w-full max-w-3xl mx-auto px-container-padding pt-6 md:pt-8 flex flex-col gap-6 relative z-10">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-primary" />
          <h1 className="text-headline-lg font-bold text-primary">
            {t("supportChat")}
          </h1>
        </div>

        {error && (
          <div className="rounded-lg bg-error/10 border border-error/30 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* Messages */}
        <GlassPanel className="mb-4 max-h-[60vh] space-y-3 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-on-surface-variant">{t("loading")}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("noMessages")}</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex flex-col">
                <span className="mb-1 text-xs font-semibold text-on-surface-variant">
                  {senderLabel(m.sender)}
                </span>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${senderColor(
                    m.sender
                  )}`}
                >
                  {displayText(m)}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </GlassPanel>

        {/* Input */}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("askAi")}
            className="h-12 flex-1 rounded-xl border border-outline-variant/50 bg-surface-container-low px-4 text-sm text-on-surface outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(208,255,130,0.3)]"
          />
          <GlowButton
            type="submit"
            disabled={!input.trim() || sending}
            className="h-12 px-6 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {t("send")}
          </GlowButton>
        </form>

        <p className="text-center text-sm text-on-surface-variant">
          <Link href="/dashboard" className="text-primary hover:underline">
            {t("backToDashboard")}
          </Link>
        </p>
      </div>
    </main>
  );
}