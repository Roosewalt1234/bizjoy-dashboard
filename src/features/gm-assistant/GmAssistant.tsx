// src/features/gm-assistant/GmAssistant.tsx
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X, Send } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDraggable } from "./useDraggable";
import { askAssistant } from "@/lib/gm-assistant.functions";
import {
  subscribe,
  getUniverseContext,
  dispatchNavigationCommand,
} from "@/lib/gm-assistant/universe-bridge";
import type { AssistantResponse, Suggestion } from "@/lib/gm-assistant/types";

const ORB_SIZE = 56;

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestions?: Suggestion[];
  fetchedAt?: string;
}

function defaultSuggestions(centerEntityKind: string | undefined): string[] {
  switch (centerEntityKind) {
    case "contract":
    case "contract-finance":
      return [
        "What's outstanding?",
        "Show its payments",
        "When is the next visit?",
        "What needs my attention?",
      ];
    case "employee":
      return ["Who is working on this?", "What needs my attention?"];
    case "customer":
      return ["Show its other contracts", "What needs my attention?"];
    default:
      return ["What needs my attention?", "Show overdue PPMs", "Who has no attendance today?"];
  }
}

export function GmAssistant() {
  const { isAdmin, isLoading } = usePermissions();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askAssistant);
  const drag = useDraggable(ORB_SIZE);

  const universeContext = useSyncExternalStore(subscribe, getUniverseContext, () => undefined);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const response: AssistantResponse = await askFn({
        data: { question: trimmed, context: universeContext },
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: response.answer,
          suggestions: response.suggestions,
          fetchedAt: response.fetchedAt,
        },
      ]);
      if (response.navigation) {
        const dispatched = dispatchNavigationCommand(response.navigation);
        if (!dispatched) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: "Open Operations Universe to navigate there." },
          ]);
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (isLoading || !isAdmin) return null;

  const panelContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        FizzFix Assistant
        {universeContext && (
          <div style={{ fontSize: 11, fontWeight: 400, color: "#8a93a3", marginTop: 2 }}>
            Talking about: {universeContext.displayLabel}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {defaultSuggestions(universeContext?.centerEntity.kind).map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => send(question)}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {question}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
            }}
          >
            <div
              style={{
                background: message.role === "user" ? "#1c2128" : "#f0f0f0",
                color: message.role === "user" ? "#e6edf3" : "#0d1117",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
              }}
            >
              {message.text}
            </div>
            {message.role === "assistant" && message.fetchedAt && (
              <div style={{ fontSize: 10, color: "#8a93a3", marginTop: 3 }}>Live FizzFix data</div>
            )}
            {message.suggestions && message.suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {message.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => send(suggestion.question)}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about FizzFix..."
          style={{
            flex: 1,
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            border: "none",
            background: "#1c2128",
            color: "white",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
          }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={() => {
          const wasDrag = drag.onPointerUp();
          if (!wasDrag) setOpen((value) => !value);
        }}
        style={{
          position: "fixed",
          left: drag.position.x,
          top: drag.position.y,
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: "50%",
          border: "none",
          background: "#1c2128",
          color: "#e6edf3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          zIndex: 1000,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          touchAction: "none",
        }}
        aria-label="FizzFix Assistant"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
      {open &&
        (isMobile ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="max-h-[70vh] p-0">
              {panelContent}
            </SheetContent>
          </Sheet>
        ) : (
          <div
            style={{
              position: "fixed",
              left: Math.min(drag.position.x, window.innerWidth - 336),
              top: Math.max(drag.position.y - 420, 16),
              width: 320,
              height: 400,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              zIndex: 1000,
              overflow: "hidden",
            }}
          >
            {panelContent}
          </div>
        ))}
    </>
  );
}
