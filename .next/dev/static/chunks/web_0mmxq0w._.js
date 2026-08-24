(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/web/components/ChatBubble.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ChatBubble
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageCircle$3e$__ = __turbopack_context__.i("[project]/web/node_modules/lucide-react/dist/esm/icons/message-circle.mjs [app-client] (ecmascript) <export default as MessageCircle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$send$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Send$3e$__ = __turbopack_context__.i("[project]/web/node_modules/lucide-react/dist/esm/icons/send.mjs [app-client] (ecmascript) <export default as Send>");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__ = __turbopack_context__.i("[project]/web/node_modules/lucide-react/dist/esm/icons/x.mjs [app-client] (ecmascript) <export default as X>");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/lib/supabase/client.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$lib$2f$i18n$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/lib/i18n.tsx [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
function ChatBubble() {
    _s();
    const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$lib$2f$supabase$2f$client$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createClient"])();
    const { t, lang } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$lib$2f$i18n$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"])();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [userId, setUserId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [input, setInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [sending, setSending] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const bottomRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const load = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ChatBubble.useCallback[load]": async ()=>{
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);
            const { data } = await supabase.from("messages").select("id, sender, message, message_ur, created_at").eq("user_id", user.id).order("created_at", {
                ascending: true
            }).limit(50);
            setMessages(data ?? []);
        }
    }["ChatBubble.useCallback[load]"], [
        supabase
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatBubble.useEffect": ()=>{
            if (open) load();
        }
    }["ChatBubble.useEffect"], [
        open,
        load
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ChatBubble.useEffect": ()=>{
            bottomRef.current?.scrollIntoView({
                behavior: "smooth"
            });
        }
    }["ChatBubble.useEffect"], [
        messages
    ]);
    const send = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "ChatBubble.useCallback[send]": async (e)=>{
            e.preventDefault();
            if (!userId || !input.trim() || sending) return;
            const text = input.trim();
            setInput("");
            setSending(true);
            setMessages({
                "ChatBubble.useCallback[send]": (prev)=>[
                        ...prev,
                        {
                            id: `temp-${Date.now()}`,
                            sender: "user",
                            message: text,
                            created_at: new Date().toISOString()
                        }
                    ]
            }["ChatBubble.useCallback[send]"]);
            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        userId,
                        text,
                        mode: "human",
                        language: lang
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed");
                setMessages({
                    "ChatBubble.useCallback[send]": (prev)=>[
                            ...prev,
                            {
                                id: `reply-${Date.now()}`,
                                sender: "system",
                                message: data.reply,
                                created_at: new Date().toISOString()
                            }
                        ]
                }["ChatBubble.useCallback[send]"]);
            } catch  {
            // ignore
            } finally{
                setSending(false);
            }
        }
    }["ChatBubble.useCallback[send]"], [
        userId,
        input,
        sending,
        lang
    ]);
    const displayText = (m)=>lang === "ur" && m.message_ur ? m.message_ur : m.message;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                type: "button",
                onClick: ()=>setOpen((o)=>!o),
                className: "fixed bottom-24 md:bottom-8 right-4 md:right-6 z-50 glass-panel rounded-full w-14 h-14 flex items-center justify-center animate-float hover:scale-110 transition-transform cursor-pointer border-primary/50 shadow-[0_0_20px_rgba(208,255,130,0.2)]",
                title: t("globalChat"),
                children: [
                    open ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$x$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__X$3e$__["X"], {
                        className: "w-6 h-6 text-primary"
                    }, void 0, false, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 93,
                        columnNumber: 17
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$circle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageCircle$3e$__["MessageCircle"], {
                        className: "w-6 h-6 text-primary"
                    }, void 0, false, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 93,
                        columnNumber: 58
                    }, this),
                    !open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "absolute top-0 right-0 w-3 h-3 bg-secondary rounded-full border-2 border-surface shadow-[0_0_5px_rgba(233,195,73,0.8)]"
                    }, void 0, false, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 94,
                        columnNumber: 19
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/components/ChatBubble.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed bottom-40 md:bottom-24 right-4 md:right-6 z-50 w-80 max-h-[60vh] flex flex-col rounded-2xl glass-panel overflow-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "p-3 border-b border-outline-variant/30 bg-surface-container-high/50",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "text-label-md text-on-surface font-semibold",
                            children: t("globalChat")
                        }, void 0, false, {
                            fileName: "[project]/web/components/ChatBubble.tsx",
                            lineNumber: 101,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 100,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2",
                        children: [
                            messages.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-sm text-on-surface-variant",
                                children: t("noMessages")
                            }, void 0, false, {
                                fileName: "[project]/web/components/ChatBubble.tsx",
                                lineNumber: 105,
                                columnNumber: 15
                            }, this) : messages.map((m)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex flex-col",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "mb-1 text-xs font-semibold text-on-surface-variant",
                                            children: m.sender === "user" ? lang === "ur" ? "آپ" : "You" : m.sender === "admin" ? "Admin" : m.sender === "ai" ? t("aiBot") : "System"
                                        }, void 0, false, {
                                            fileName: "[project]/web/components/ChatBubble.tsx",
                                            lineNumber: 109,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: `max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.sender === "user" ? "bg-primary-container text-on-primary-container" : m.sender === "admin" ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface"}`,
                                            children: displayText(m)
                                        }, void 0, false, {
                                            fileName: "[project]/web/components/ChatBubble.tsx",
                                            lineNumber: 112,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, m.id, true, {
                                    fileName: "[project]/web/components/ChatBubble.tsx",
                                    lineNumber: 108,
                                    columnNumber: 17
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                ref: bottomRef
                            }, void 0, false, {
                                fileName: "[project]/web/components/ChatBubble.tsx",
                                lineNumber: 124,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 103,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                        onSubmit: send,
                        className: "p-2 border-t border-outline-variant/30 flex gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                value: input,
                                onChange: (e)=>setInput(e.target.value),
                                placeholder: t("typeHuman"),
                                className: "h-10 flex-1 rounded-lg border border-outline-variant/50 bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-primary"
                            }, void 0, false, {
                                fileName: "[project]/web/components/ChatBubble.tsx",
                                lineNumber: 127,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "submit",
                                disabled: !input.trim() || sending,
                                className: "btn-3d-lime h-10 rounded-lg px-3 text-sm font-bold disabled:opacity-50",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$send$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Send$3e$__["Send"], {
                                    className: "w-4 h-4"
                                }, void 0, false, {
                                    fileName: "[project]/web/components/ChatBubble.tsx",
                                    lineNumber: 134,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/web/components/ChatBubble.tsx",
                                lineNumber: 133,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/web/components/ChatBubble.tsx",
                        lineNumber: 126,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/web/components/ChatBubble.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/web/components/ChatBubble.tsx",
        lineNumber: 85,
        columnNumber: 5
    }, this);
}
_s(ChatBubble, "Wsty7BTVCr9gAgmU16udN0ESeJs=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$lib$2f$i18n$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useI18n"]
    ];
});
_c = ChatBubble;
var _c;
__turbopack_context__.k.register(_c, "ChatBubble");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/web/lib/i18n.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "I18nProvider",
    ()=>I18nProvider,
    "translations",
    ()=>translations,
    "useI18n",
    ()=>useI18n
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
"use client";
;
const translations = {
    en: {
        appName: "TDX Investment",
        dashboard: "Dashboard",
        tasks: "Tasks",
        stats: "Stats",
        chat: "Chat",
        home: "Home",
        admin: "Admin",
        login: "Log in",
        register: "Register",
        logout: "Log out",
        totalBalance: "Total Balance",
        activeDeposits: "Active Deposits",
        dailyTasks: "Daily Tasks",
        totalWithdrawals: "Total Withdrawals",
        dailyPotential: "Daily Potential",
        earned: "Earned",
        deposit: "Deposit",
        withdraw: "Withdraw",
        totalDeposited: "Total Deposited",
        totalProfit: "Total Profit",
        totalWithdrawn: "Total Withdrawn",
        referralBonus: "Referral Bonus",
        deductions: "Deductions",
        yourProfile: "Your Profile",
        recentDeposits: "Recent Deposits",
        noDeposits: "No deposits yet. Make your first deposit above.",
        statistics: "Statistics",
        backToDashboard: "← Back to Dashboard",
        backToHome: "← Back to Home",
        welcomeBack: "Welcome back! Log in to your account.",
        emailOrMobile: "Email or Mobile Number",
        password: "Password",
        loggingIn: "Logging in...",
        dontHaveAccount: "Don't have an account?",
        createAccount: "Create your account to start investing.",
        fullName: "Full Name",
        fullAddress: "Full Address",
        city: "City",
        mobileNumber: "WhatsApp Number",
        accountNumber: "Account Number",
        paymentMethod: "Payment Method",
        username: "Username",
        referralCode: "Referral Code",
        optional: "(optional)",
        liveSelfie: "Live Selfie",
        pleaseTakeSelfie: "Please take a live selfie to continue.",
        selfieCaptured: "Selfie captured ✓",
        alreadyHaveAccount: "Already have an account?",
        supportChat: "Support Chat",
        aiBot: "AI Bot",
        realHuman: "Real Human",
        humanWillReply: "A human admin will reply soon.",
        noMessages: "No messages yet. Ask us anything!",
        send: "Send",
        askAi: "Ask the AI bot a question...",
        typeHuman: "Type a message for a human admin...",
        withdrawFunds: "Withdraw Funds",
        amountPkr: "Amount (PKR)",
        processing: "Processing...",
        withdrawNote: "The withdraw amount will be transferred into your account within 24-48 hours. Please note: 100 rupees will be charged per withdrawal.",
        withdrawalHistory: "Withdrawal History",
        pending: "Pending",
        approved: "Approved",
        completed: "Completed",
        rejected: "Rejected",
        today: "Today",
        pendingFromPrevious: "Pending from previous days",
        todaysTasks: "Today's Tasks",
        openYouTube: "Open YouTube",
        instructions: "Instructions:",
        watchVideo: "1. Watch the video",
        likeVideo: "2. Like the video",
        subscribe: "3. Subscribe to the channel",
        comment: "4. Comment:",
        uploadScreenshot: "Upload screenshot of your comment",
        uploading: "Uploading...",
        screenshotUploaded: "Screenshot uploaded ✓",
        allTasksDone: "🎉 All tasks for today are complete!",
        greatJob: "Great job. Come back tomorrow for new tasks.",
        noTasksToday: "No tasks for today yet.",
        loading: "Loading...",
        missedDays: (n)=>`⚠️ You missed ${n} day${n > 1 ? "s" : ""} — Rs 200 per day has been deducted from your account.`,
        ok: "OK",
        controlRoom: "Control Room",
        systemOversight: "System oversight and real-time operations.",
        overview: "Overview",
        users: "Users",
        deposits: "Deposits",
        withdrawals: "Withdrawals",
        announcements: "Announcements",
        payouts: "Payouts",
        totalUsers: "Total Users",
        activeUsers: "Active Users",
        suspendedUsers: "Suspended Users",
        totalApprovedDeposits: "Total Approved Deposits",
        pendingDeposits: "Pending Deposits",
        pendingWithdrawals: "Pending Withdrawals",
        liveActivity: "Live Activity",
        live: "LIVE",
        globalProfit: "Global Profit",
        yieldRate: "YIELD RATE",
        totalLiquidity: "Total Liquidity Pool",
        systemHealth: "System Health",
        optimal: "OPTIMAL",
        serverLoad: "Server Load",
        apiLatency: "API Latency",
        databaseSync: "Database Sync",
        actionRequired: "Action Required",
        verificationQueue: "Verification Queue",
        allDeposits: "All Deposits",
        webApprove: "Web Approve",
        notReceived: "Not Received",
        viewReceipt: "View Receipt",
        close: "Close",
        view: "View",
        suspend: "Suspend",
        activate: "Activate",
        resetPassword: "Reset password",
        name: "Name",
        mobile: "Mobile",
        account: "Account",
        payment: "Payment",
        deposited: "Deposited",
        withdrawn: "Withdrawn",
        status: "Status",
        registered: "Registered",
        profitOn: "Profit On",
        actions: "Actions",
        active: "Active",
        inactive: "Inactive",
        suspended: "Suspended",
        invoice: "Investment Invoice",
        print: "Print",
        invoiceNo: "Invoice #",
        contactNumber: "Contact Number",
        paymentChannel: "Payment Channel",
        profitStartDate: "Profit Start Date",
        profitEndDate: "Profit End Date (1 year)",
        monthlyProfit: "Monthly Profit %",
        yearlyProfit: "Yearly Profit %",
        depositedAmount: "Deposited Amount",
        terms: "Terms & Conditions:",
        termsText: "In case of complete investment return, the user can request their investment back. Once approved, the investment amount will be returned to the same account used for deposit within 45 working days. Saturday and Sunday are off days and do not count.",
        growYourFortune: "Grow Your Fortune, Win Your Future.",
        heroSubtitle: "Step into the next generation of digital wealth building. High-stakes financial growth powered by cutting-edge, gamified engagement protocols.",
        startEarning: "Start Earning",
        securePlatform: "Secure Platform",
        livePayouts: "Live Payouts: PKR 1,204,500+ Today",
        language: "Language",
        sysDepositApproved: "Congratulations! Your deposit has been approved and your profit program is now active.",
        sysDepositRejected: "Your deposit amount has not received yet, please try again and upload the real screenshot.",
        sysPayoutSent: "Congratulations! Your monthly profit has been sent to your account.",
        sysInvestmentReturn: "Your investment return request has been approved. The amount will be returned to your account within 45 working days.",
        aiUnavailable: "AI is temporarily unavailable — switch to Real Human",
        adminPanel: "Admin Panel",
        dashboardLink: "Dashboard",
        noPendingApprovals: "No pending approvals.",
        noPendingDeposits: "No pending deposits.",
        noUsersFound: "No users found.",
        noDepositsFound: "No deposits found.",
        noTasksForToday: "No tasks for today yet.",
        noMessagesYet: "No messages yet. Ask us anything!",
        loadingMessages: "Loading messages...",
        failedToLoad: "Failed to load.",
        failedToSend: "Failed to send message.",
        failedToLoadTasks: "Failed to load tasks.",
        failedToLoadDashboard: "Failed to load dashboard.",
        failedToLoadStatistics: "Failed to load statistics.",
        failedToLoadAdmin: "Failed to load admin data.",
        failedToLoadMessages: "Failed to load messages.",
        uploadFailed: "Upload failed.",
        pleaseFillAll: "Please fill in all required fields correctly.",
        enterValidMobile: "Enter a valid WhatsApp number (03XXXXXXXXX).",
        passwordMin: "Password must be at least 6 characters.",
        loginFailed: "Login failed. Please try again.",
        notAuthenticated: "Not authenticated.",
        enterValidAmount: "Please enter a valid amount.",
        withdrawalSubmitted: "Withdrawal request submitted successfully!",
        registrationFailed: "Registration failed.",
        signUpNoUser: "Sign up did not return a user.",
        googleNotConfigured: "Google sign-in is not configured yet. Please register with email/phone instead.",
        alreadyRegistered: "This phone/email is already registered — please log in instead.",
        usernameTaken: (u)=>`Your username was taken — your new username is @${u}`,
        registrationFailedAt: (step, msg)=>`Registration failed at ${step}: ${msg}`,
        stepSelfieUpload: "selfie upload",
        stepProfileSave: "profile save",
        stepSelfieVerification: "selfie verification",
        stepSignUp: "sign up",
        tierStarter: "Starter Matrix",
        tierApex: "Apex Yield",
        tierMomentum: "Momentum Node",
        tierStarterDesc: "Begin your journey. Consistent daily drip yields with baseline gamification.",
        tierApexDesc: "Maximum velocity wealth generation. Unlocks premium tasks, 3x multipliers, and exclusive airdrops.",
        tierMomentumDesc: "Accelerated growth vectors. Access advanced algorithmic staking and daily bonus drops.",
        perEntry: "/entry",
        mostPopular: "MOST POPULAR",
        claimApex: "Claim Apex Tier",
        initiateProtocol: "Initiate Protocol",
        footerTerms: "Terms",
        footerPrivacy: "Privacy",
        footerSupport: "Support",
        footerCopyright: "© 2024 TDX Investment Corp. All Rights Reserved.",
        withdrawAmount: "Withdraw Funds",
        withdrawNote2: "The withdraw amount will be transferred into your account within 24-48 hours. Please note: 100 rupees will be charged per withdrawal.",
        complete2More: "Complete 2 more tasks to level up!",
        invoiceNotFound: "Invoice not found",
        markCompleted: "Mark Completed",
        reject: "Reject",
        fee: "Fee",
        net: "Net",
        requestedDate: "Requested Date",
        userDetails: "User Details",
        sysWithdrawalCompleted: "Your withdrawal of Rs {amount} has been completed and sent to your account.",
        sysWithdrawalRejected: "Your withdrawal request of Rs {amount} has been rejected.",
        titleEn: "Title (EN)",
        titleUr: "Title (اردو)",
        contentEn: "Content (EN)",
        contentUr: "Content (اردو)",
        publish: "Publish",
        delete: "Delete",
        noAnnouncements: "No announcements yet.",
        announcementPublished: "Announcement published.",
        announcementDeleted: "Announcement deleted.",
        payoutDue: "Payout Due",
        dueSoon: "Due Soon",
        payoutSent: "Payout Sent",
        monthYear: "Month/Year",
        payoutDate: "Payout Date",
        sysPayoutSentAmount: "Congratulations! Your monthly profit of Rs {amount} has been sent to your account.",
        noPendingPayouts: "No pending payouts.",
        investmentReturns: "Investment Returns",
        requested: "Requested",
        approve: "Approve",
        sysReturnApproved: "Your investment return of Rs {amount} has been approved and added to your balance.",
        sysReturnRejected: "Your investment return request of Rs {amount} has been rejected.",
        noReturnRequests: "No investment return requests.",
        export: "Export",
        printPdf: "Print/PDF",
        chatUsers: "Chat Users",
        lastMessage: "Last Message",
        unread: "Unread",
        replyAsAdmin: "Reply as Admin",
        replySent: "Reply sent.",
        noChatUsers: "No chat users.",
        selectUser: "Select user",
        noWithdrawals: "No withdrawals.",
        noPayouts: "No payouts.",
        noReturns: "No returns.",
        allWithdrawals: "All Withdrawals",
        allPayouts: "All Payouts",
        allReturns: "All Returns",
        allAnnouncements: "All Announcements",
        notifications: "Notifications",
        notificationBell: "Notifications",
        noNotifications: "No notifications yet.",
        markAllRead: "Mark all read",
        markRead: "Mark read",
        enablePush: "Enable push notifications",
        pushEnabled: "Push notifications enabled",
        globalChat: "Global Chat",
        composeNotification: "Compose Notification",
        notificationComposer: "Compose Notification",
        titleEn2: "Title (EN)",
        titleUr2: "Title (اردو)",
        messageEn: "Message (EN)",
        messageUr: "Message (اردو)",
        targetAudience: "Target Audience",
        allUsers: "All Users",
        specificUser: "Specific User",
        selectUser2: "Select user",
        sendNotification: "Send Notification",
        notificationSent: "Notification sent.",
        notificationLog: "Notification Log",
        sentTo: "Sent To",
        readBy: "Read By",
        noNotificationsSent: "No notifications sent yet.",
        unreadReminder: "You have unread messages from Admin",
        chatWithAdmin: "Chat with Admin",
        chatBubbleSend: "Send",
        chatBubblePlaceholder: "Type a message...",
        adminReply: "Admin Reply",
        notificationInbox: "Notifications",
        enablePushNotifications: "Enable push notifications",
        pushNotificationsOn: "Push notifications enabled",
        forbidden: "You do not have access to this resource."
    },
    ur: {
        appName: "ٹی ڈی ایکس انویسٹمنٹ",
        dashboard: "ڈیش بورڈ",
        tasks: "ٹاسکس",
        stats: "شماریات",
        chat: "چیٹ",
        home: "ہوم",
        admin: "ایڈمن",
        login: "لاگ ان",
        register: "رجسٹر",
        logout: "لاگ آؤٹ",
        totalBalance: "کل بیلنس",
        activeDeposits: "فعال ڈپازٹس",
        dailyTasks: "روزانہ ٹاسکس",
        totalWithdrawals: "کل نکاسی",
        dailyPotential: "روزانہ صلاحیت",
        earned: "حاصل شدہ",
        deposit: "ڈپازٹ",
        withdraw: "نکاسی",
        totalDeposited: "کل جمع شدہ",
        totalProfit: "کل منافع",
        totalWithdrawn: "کل نکالا گیا",
        referralBonus: "ریفرل بونس",
        deductions: "کٹوتیاں",
        yourProfile: "آپ کی پروفائل",
        recentDeposits: "حالیہ ڈپازٹس",
        noDeposits: "ابھی کوئی ڈپازٹ نہیں۔ اوپر اپنا پہلا ڈپازٹ کریں۔",
        statistics: "شماریات",
        backToDashboard: "← ڈیش بورڈ پر واپس",
        backToHome: "← ہوم پر واپس",
        welcomeBack: "خوش آمدید! اپنے اکاؤنٹ میں لاگ ان کریں۔",
        emailOrMobile: "ای میل یا موبائل نمبر",
        password: "پاس ورڈ",
        loggingIn: "لاگ ان ہو رہا ہے...",
        dontHaveAccount: "اکاؤنٹ نہیں ہے؟",
        createAccount: "سرمایہ کاری شروع کرنے کے لیے اپنا اکاؤنٹ بنائیں۔",
        fullName: "پورا نام",
        fullAddress: "مکمل پتہ",
        city: "شہر",
        mobileNumber: "واٹس ایپ نمبر",
        accountNumber: "اکاؤنٹ نمبر",
        paymentMethod: "ادائیگی کا طریقہ",
        username: "صارف نام",
        referralCode: "ریفرل کوڈ",
        optional: "(اختیاری)",
        liveSelfie: "لائیو سیلفی",
        pleaseTakeSelfie: "جاری رکھنے کے لیے براہ کرم لائیو سیلفی لیں۔",
        selfieCaptured: "سیلفی لی گئی ✓",
        alreadyHaveAccount: "پہلے سے اکاؤنٹ ہے؟",
        supportChat: "سپورٹ چیٹ",
        aiBot: "اے آئی بوٹ",
        realHuman: "حقیقی انسان",
        humanWillReply: "ایک ایڈمن جلد جواب دے گا۔",
        noMessages: "ابھی کوئی پیغام نہیں۔ ہم سے کچھ بھی پوچھیں!",
        send: "بھیجیں",
        askAi: "اے آئی بوٹ سے سوال پوچھیں...",
        typeHuman: "ایڈمن کے لیے پیغام لکھیں...",
        withdrawFunds: "فنڈز نکالیں",
        amountPkr: "رقم (پی کے آر)",
        processing: "کارروائی جاری...",
        withdrawNote: "نکاسی کی رقم 24-48 گھنٹوں میں آپ کے اکاؤنٹ میں منتقل کر دی جائے گی۔ براہ کرم نوٹ کریں: ہر نکاسی پر 100 روپے چارج ہوں گے۔",
        withdrawalHistory: "نکاسی کی تاریخ",
        pending: "زیر التوا",
        approved: "منظور شدہ",
        completed: "مکمل",
        rejected: "مسترد",
        today: "آج",
        pendingFromPrevious: "پچھلے دنوں سے زیر التوا",
        todaysTasks: "آج کے ٹاسکس",
        openYouTube: "یوٹیوب کھولیں",
        instructions: "ہدایات:",
        watchVideo: "1. ویڈیو دیکھیں",
        likeVideo: "2. ویڈیو کو لائک کریں",
        subscribe: "3. چینل کو سبسکرائب کریں",
        comment: "4. کمنٹ کریں:",
        uploadScreenshot: "اپنے کمنٹ کا اسکرین شاٹ اپ لوڈ کریں",
        uploading: "اپ لوڈ ہو رہا ہے...",
        screenshotUploaded: "اسکرین شاٹ اپ لوڈ ہو گیا ✓",
        allTasksDone: "🎉 آج کے تمام ٹاسکس مکمل!",
        greatJob: "بہت خوب۔ کل نئے ٹاسکس کے لیے واپس آئیں۔",
        noTasksToday: "آج کے لیے ابھی کوئی ٹاسک نہیں۔",
        loading: "لوڈ ہو رہا ہے...",
        missedDays: (n)=>`⚠️ آپ نے ${n} دن${n > 1 ? "وں" : ""} کے ٹاسک مکمل نہیں کیے — ہر دن کے لیے 200 روپے کاٹے گئے ہیں۔`,
        ok: "ٹھیک ہے",
        controlRoom: "کنٹرول روم",
        systemOversight: "سسٹم نگرانی اور ریئل ٹائم آپریشنز۔",
        overview: "جائزہ",
        users: "صارفین",
        deposits: "ڈپازٹس",
        withdrawals: "نکاسی",
        announcements: "اعلانات",
        payouts: "ادائیگیاں",
        totalUsers: "کل صارفین",
        activeUsers: "فعال صارفین",
        suspendedUsers: "معطل صارفین",
        totalApprovedDeposits: "کل منظور شدہ ڈپازٹس",
        pendingDeposits: "زیر التوا ڈپازٹس",
        pendingWithdrawals: "زیر التوا نکاسی",
        liveActivity: "لائیو سرگرمی",
        live: "لائیو",
        globalProfit: "عالمی منافع",
        yieldRate: "پیداوار کی شرح",
        totalLiquidity: "کل لیکویڈیٹی پول",
        systemHealth: "سسٹم صحت",
        optimal: "بہترین",
        serverLoad: "سرور لوڈ",
        apiLatency: "اے پی آئی تاخیر",
        databaseSync: "ڈیٹا بیس مطابقت",
        actionRequired: "کارروائی درکار",
        verificationQueue: "تصدیق کی قطار",
        allDeposits: "تمام ڈپازٹس",
        webApprove: "ویب منظور",
        notReceived: "موصول نہیں ہوا",
        viewReceipt: "رسید دیکھیں",
        close: "بند کریں",
        view: "دیکھیں",
        suspend: "معطل کریں",
        activate: "فعال کریں",
        resetPassword: "پاس ورڈ ری سیٹ",
        name: "نام",
        mobile: "موبائل",
        account: "اکاؤنٹ",
        payment: "ادائیگی",
        deposited: "جمع شدہ",
        withdrawn: "نکالا گیا",
        status: "حالت",
        registered: "رجسٹرڈ",
        profitOn: "منافع شروع",
        actions: "کارروائیاں",
        active: "فعال",
        inactive: "غیر فعال",
        suspended: "معطل",
        invoice: "سرمایہ کاری انوائس",
        print: "پرنٹ",
        invoiceNo: "انوائس #",
        contactNumber: "رابطہ نمبر",
        paymentChannel: "ادائیگی چینل",
        profitStartDate: "منافع شروع کی تاریخ",
        profitEndDate: "منافع ختم کی تاریخ (1 سال)",
        monthlyProfit: "ماہانہ منافع %",
        yearlyProfit: "سالانہ منافع %",
        depositedAmount: "جمع شدہ رقم",
        terms: "شرائط و ضوابط:",
        termsText: "مکمل سرمایہ کاری واپسی کی صورت میں، صارف اپنی سرمایہ کاری واپس مانگ سکتا ہے۔ منظوری کے بعد، سرمایہ کاری کی رقم 45 کام کے دنوں میں ڈپازٹ کے لیے استعمال شدہ اکاؤنٹ میں واپس کر دی جائے گی۔ ہفتہ اور اتوار چھٹی کے دن ہیں اور شمار نہیں ہوتے۔",
        growYourFortune: "اپنی دولت بڑھائیں، اپنا مستقبل جیتیں۔",
        heroSubtitle: "ڈیجیٹل دولت بنانے کی اگلی نسل میں قدم رکھیں۔ جدید ترین، گیمیفائیڈ مصروفیت پروٹوکولز کے ذریعے اعلیٰ مالی ترقی۔",
        startEarning: "کمانا شروع کریں",
        securePlatform: "محفوظ پلیٹ فارم",
        livePayouts: "لائیو ادائیگیاں: آج PKR 1,204,500+",
        language: "زبان",
        sysDepositApproved: "مبارک ہو! آپ کا ڈپازٹ منظور ہو گیا ہے اور آپ کا منافع پروگرام اب فعال ہے۔",
        sysDepositRejected: "آپ کی ڈپازٹ رقم ابھی موصول نہیں ہوئی، براہ کرم دوبارہ کوشش کریں اور حقیقی اسکرین شاٹ اپ لوڈ کریں۔",
        sysPayoutSent: "مبارک ہو! آپ کا ماہانہ منافع آپ کے اکاؤنٹ میں بھیج دیا گیا ہے۔",
        sysInvestmentReturn: "آپ کی سرمایہ کاری واپسی کی درخواست منظور ہو گئی ہے۔ رقم 45 کام کے دنوں میں آپ کے اکاؤنٹ میں واپس کر دی جائے گی۔",
        aiUnavailable: "اے آئی فی الحال دستیاب نہیں — حقیقی انسان پر سوئچ کریں",
        adminPanel: "ایڈمن پینل",
        dashboardLink: "ڈیش بورڈ",
        noPendingApprovals: "کوئی زیر التوا منظوری نہیں۔",
        noPendingDeposits: "کوئی زیر التوا ڈپازٹ نہیں۔",
        noUsersFound: "کوئی صارف نہیں ملا۔",
        noDepositsFound: "کوئی ڈپازٹ نہیں ملا۔",
        noTasksForToday: "آج کے لیے ابھی کوئی ٹاسک نہیں۔",
        noMessagesYet: "ابھی کوئی پیغام نہیں۔ ہم سے کچھ بھی پوچھیں!",
        loadingMessages: "پیغامات لوڈ ہو رہے ہیں...",
        failedToLoad: "لوڈ کرنے میں ناکامی۔",
        failedToSend: "پیغام بھیجنے میں ناکامی۔",
        failedToLoadTasks: "ٹاسکس لوڈ کرنے میں ناکامی۔",
        failedToLoadDashboard: "ڈیش بورڈ لوڈ کرنے میں ناکامی۔",
        failedToLoadStatistics: "شماریات لوڈ کرنے میں ناکامی۔",
        failedToLoadAdmin: "ایڈمن ڈیٹا لوڈ کرنے میں ناکامی۔",
        failedToLoadMessages: "پیغامات لوڈ کرنے میں ناکامی۔",
        uploadFailed: "اپ لوڈ ناکام۔",
        pleaseFillAll: "براہ کرم تمام مطلوبہ فیلڈز درست طریقے سے پُر کریں۔",
        enterValidMobile: "درست واٹس ایپ نمبر درج کریں (03XXXXXXXXX)۔",
        passwordMin: "پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے۔",
        loginFailed: "لاگ ان ناکام۔ براہ کرم دوبارہ کوشش کریں۔",
        notAuthenticated: "تصدیق شدہ نہیں۔",
        enterValidAmount: "براہ کرم درست رقم درج کریں۔",
        withdrawalSubmitted: "نکاسی کی درخواست کامیابی سے جمع کر دی گئی!",
        registrationFailed: "رجسٹریشن ناکام۔",
        signUpNoUser: "سائن اپ نے صارف واپس نہیں کیا۔",
        googleNotConfigured: "گوگل سائن ان ابھی ترتیب نہیں دیا گیا۔ براہ کرم ای میل/فون سے رجسٹر کریں۔",
        alreadyRegistered: "یہ فون/ای میل پہلے سے رجسٹرڈ ہے — براہ کرم لاگ ان کریں۔",
        usernameTaken: (u)=>`آپ کا صارف نام لیا جا چکا تھا — آپ کا نیا صارف نام @${u} ہے`,
        registrationFailedAt: (step, msg)=>`رجسٹریشن ${step} پر ناکام: ${msg}`,
        stepSelfieUpload: "سیلفی اپ لوڈ",
        stepProfileSave: "پروفائل محفوظ",
        stepSelfieVerification: "سیلفی تصدیق",
        stepSignUp: "سائن اپ",
        tierStarter: "اسٹارٹر میٹرکس",
        tierApex: "ایپیکس ییلڈ",
        tierMomentum: "مومینٹم نوڈ",
        tierStarterDesc: "اپنا سفر شروع کریں۔ بنیادی گیمیفیکیشن کے ساتھ مستقل روزانہ منافع۔",
        tierApexDesc: "زیادہ سے زیادہ رفتار دولت پیدا کرنا۔ پریمیم ٹاسکس، 3x ملٹی پلائرز، اور خصوصی ایئر ڈراپس۔",
        tierMomentumDesc: "تیز رفتار ترقی کے ویکٹر۔ اعلیٰ الگورتھمک اسٹیکنگ اور روزانہ بونس ڈراپس۔",
        perEntry: "/انٹری",
        mostPopular: "سب سے مقبول",
        claimApex: "ایپیکس ٹیئر حاصل کریں",
        initiateProtocol: "پروٹوکول شروع کریں",
        footerTerms: "شرائط",
        footerPrivacy: "رازداری",
        footerSupport: "سپورٹ",
        footerCopyright: "© 2024 ٹی ڈی ایکس انویسٹمنٹ کارپوریشن۔ جملہ حقوق محفوظ ہیں۔",
        withdrawAmount: "فنڈز نکالیں",
        withdrawNote2: "نکاسی کی رقم 24-48 گھنٹوں میں آپ کے اکاؤنٹ میں منتقل کر دی جائے گی۔ براہ کرم نوٹ کریں: ہر نکاسی پر 100 روپے چارج ہوں گے۔",
        complete2More: "لیول اپ کرنے کے لیے 2 مزید ٹاسک مکمل کریں!",
        invoiceNotFound: "انوائس نہیں ملی",
        markCompleted: "مکمل شدہ نشان لگائیں",
        reject: "مسترد کریں",
        fee: "فیس",
        net: "خالص",
        requestedDate: "درخواست کی تاریخ",
        userDetails: "صارف کی تفصیلات",
        sysWithdrawalCompleted: "آپ کی {amount} روپے کی نکاسی مکمل ہو گئی ہے اور آپ کے اکاؤنٹ میں بھیج دی گئی ہے۔",
        sysWithdrawalRejected: "آپ کی {amount} روپے کی نکاسی کی درخواست مسترد کر دی گئی ہے۔",
        titleEn: "عنوان (انگریزی)",
        titleUr: "عنوان (اردو)",
        contentEn: "مواد (انگریزی)",
        contentUr: "مواد (اردو)",
        publish: "شائع کریں",
        delete: "حذف کریں",
        noAnnouncements: "ابھی کوئی اعلان نہیں۔",
        announcementPublished: "اعلان شائع ہو گیا۔",
        announcementDeleted: "اعلان حذف ہو گیا۔",
        payoutDue: "ادائیگی واجب",
        dueSoon: "جلد واجب",
        payoutSent: "ادائیگی بھیج دی گئی",
        monthYear: "مہینہ/سال",
        payoutDate: "ادائیگی کی تاریخ",
        sysPayoutSentAmount: "مبارک ہو! آپ کا {amount} روپے کا ماہانہ منافع آپ کے اکاؤنٹ میں بھیج دیا گیا ہے۔",
        noPendingPayouts: "کوئی زیر التوا ادائیگی نہیں۔",
        investmentReturns: "سرمایہ کاری واپسی",
        requested: "درخواست شدہ",
        approve: "منظور کریں",
        sysReturnApproved: "آپ کی {amount} روپے کی سرمایہ کاری واپسی منظور ہو گئی ہے اور آپ کے بیلنس میں شامل کر دی گئی ہے۔",
        sysReturnRejected: "آپ کی {amount} روپے کی سرمایہ کاری واپسی کی درخواست مسترد کر دی گئی ہے۔",
        noReturnRequests: "کوئی سرمایہ کاری واپسی کی درخواست نہیں۔",
        export: "برآمد کریں",
        printPdf: "پرنٹ/پی ڈی ایف",
        chatUsers: "چیٹ صارفین",
        lastMessage: "آخری پیغام",
        unread: "غیر پڑھا ہوا",
        replyAsAdmin: "ایڈمن کے طور پر جواب دیں",
        replySent: "جواب بھیج دیا گیا۔",
        noChatUsers: "کوئی چیٹ صارف نہیں۔",
        selectUser: "صارف منتخب کریں",
        noWithdrawals: "کوئی نکاسی نہیں۔",
        noPayouts: "کوئی ادائیگی نہیں۔",
        noReturns: "کوئی واپسی نہیں۔",
        allWithdrawals: "تمام نکاسی",
        allPayouts: "تمام ادائیگیاں",
        allReturns: "تمام واپسیاں",
        allAnnouncements: "تمام اعلانات",
        notifications: "اطلاعات",
        notificationBell: "اطلاعات",
        noNotifications: "ابھی کوئی اطلاع نہیں۔",
        markAllRead: "سب پڑھا ہوا نشان لگائیں",
        markRead: "پڑھا ہوا نشان لگائیں",
        enablePush: "پش اطلاعات فعال کریں",
        pushEnabled: "پش اطلاعات فعال ہو گئیں",
        globalChat: "عالمی چیٹ",
        composeNotification: "اطلاع تحریر کریں",
        notificationComposer: "اطلاع تحریر کریں",
        titleEn2: "عنوان (انگریزی)",
        titleUr2: "عنوان (اردو)",
        messageEn: "پیغام (انگریزی)",
        messageUr: "پیغام (اردو)",
        targetAudience: "ہدف سامعین",
        allUsers: "تمام صارفین",
        specificUser: "مخصوص صارف",
        selectUser2: "صارف منتخب کریں",
        sendNotification: "اطلاع بھیجیں",
        notificationSent: "اطلاع بھیج دی گئی۔",
        notificationLog: "اطلاعات کا ریکارڈ",
        sentTo: "بھیجا گیا",
        readBy: "پڑھا ہوا",
        noNotificationsSent: "ابھی کوئی اطلاع نہیں بھیجی گئی۔",
        unreadReminder: "آپ کے پاس ایڈمن کے غیر پڑھے ہوئے پیغامات ہیں",
        chatWithAdmin: "ایڈمن سے بات کریں",
        chatBubbleSend: "بھیجیں",
        chatBubblePlaceholder: "پیغام لکھیں...",
        adminReply: "ایڈمن کا جواب",
        notificationInbox: "اطلاعات",
        enablePushNotifications: "پش اطلاعات فعال کریں",
        pushNotificationsOn: "پش اطلاعات فعال ہو گئیں",
        forbidden: "آپ کو اس وسائل تک رسائی نہیں ہے۔"
    }
};
const I18nContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])({
    lang: "en",
    setLang: ()=>{},
    t: (key)=>translations.en[key],
    dir: "ltr"
});
function getCookie(name) {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
}
function setCookie(name, value, days = 365) {
    if (typeof document === "undefined") return;
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/`;
}
function I18nProvider({ children }) {
    _s();
    const [lang, setLangState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("ur");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "I18nProvider.useEffect": ()=>{
            const saved = getCookie("locale");
            if (saved === "en" || saved === "ur") {
                setLangState(saved);
            }
        }
    }["I18nProvider.useEffect"], []);
    const setLang = (l)=>{
        setLangState(l);
        setCookie("locale", l);
    };
    const dir = lang === "ur" ? "rtl" : "ltr";
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "I18nProvider.useEffect": ()=>{
            document.documentElement.dir = dir;
            document.documentElement.lang = lang;
        }
    }["I18nProvider.useEffect"], [
        dir,
        lang
    ]);
    const t = (key)=>{
        const dict = translations[lang];
        const val = dict[key];
        return typeof val === "function" ? val() : val;
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(I18nContext.Provider, {
        value: {
            lang,
            setLang,
            t,
            dir
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/web/lib/i18n.tsx",
        lineNumber: 684,
        columnNumber: 5
    }, this);
}
_s(I18nProvider, "k9oFlQ2mSG5HCo3QsAIQi0tQE94=");
_c = I18nProvider;
function useI18n() {
    _s1();
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(I18nContext);
}
_s1(useI18n, "gDsCjeeItUuvgOWf1v4qoK9RF6k=");
var _c;
__turbopack_context__.k.register(_c, "I18nProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/web/lib/supabase/client.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createClient",
    ()=>createClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/web/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/web/node_modules/@supabase/ssr/dist/module/createBrowserClient.js [app-client] (ecmascript)");
;
function createClient() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$web$2f$node_modules$2f40$supabase$2f$ssr$2f$dist$2f$module$2f$createBrowserClient$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createBrowserClient"])(("TURBOPACK compile-time value", "https://jgbbifiizezrwvesdisc.supabase.co"), ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmJpZmlpemV6cnd2ZXNkaXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjQ2ODYsImV4cCI6MjEwMjU0MDY4Nn0.gGFDL-sVjmbwXjBwEhr4JG2mqeLIGlASYB71lZONq-Y"));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=web_0mmxq0w._.js.map