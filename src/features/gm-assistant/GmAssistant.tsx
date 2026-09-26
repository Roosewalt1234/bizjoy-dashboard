// src/features/gm-assistant/GmAssistant.tsx
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X, Send, Mic, Square, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDraggable } from "./useDraggable";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { askAssistant, transcribeAudio } from "@/lib/gm-assistant.functions";
import {
  subscribe,
  getUniverseContext,
  dispatchNavigationCommand,
} from "@/lib/gm-assistant/universe-bridge";
import type { AssistantResponse, Suggestion } from "@/lib/gm-assistant/types";

const ORB_SIZE = 56;

const smallVoiceButtonStyle: CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  cursor: "pointer",
};

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
  const transcribeFn = useServerFn(transcribeAudio);
  const drag = useDraggable(ORB_SIZE);
  // Set at the moment the mic is tapped (Step 6), read when the full voice round trip finishes,
  // so the "total" latency log spans tap -> answer, not just transcript-ready -> answer.
  const voiceTapStartRef = useRef(0);
  // Typed and voice questions both call send() - without this, a voice transcript resolving
  // while a typed question is still in flight (or vice versa) would hit the `sending` guard
  // below and be silently dropped with no feedback. Chaining every call onto this ref instead
  // serializes them: whichever arrives second just waits its turn rather than being discarded.
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const universeContext = useSyncExternalStore(subscribe, getUniverseContext, () => undefined);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function send(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) return Promise.resolve();
    sendQueueRef.current = sendQueueRef.current.then(() => sendNow(trimmed));
    return sendQueueRef.current;
  }

  async function sendNow(trimmed: string) {
    // Deliberately does NOT touch `input` - send() is called from both the typed-input form and
    // the voice transcript path, and clearing the draft here would wipe out whatever the GM is
    // mid-typing if a voice answer lands while they're composing a follow-up. Only the form's
    // own submit handler clears its own input.
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
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

  const voice = useVoiceRecorder({
    transcribeAudio: async (audioBase64, mimeType) => {
      const result = await transcribeFn({ data: { audioBase64, mimeType } });
      return result.text;
    },
    onTranscript: async (text) => {
      // Voice contributes ONLY a piece of text here - everything downstream (display, intent
      // resolution, navigation, the write-action refusal) is the exact same path a typed
      // question already goes through.
      await send(text);
      console.debug("[gm-assistant:voice] total", {
        ms: Math.round(performance.now() - voiceTapStartRef.current),
      });
    },
  });

  if (isLoading || !isAdmin) return null;

  const panelContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>FizzFix Assistant</div>
          {universeContext && (
            <div style={{ fontSize: 11, fontWeight: 400, color: "#8a93a3", marginTop: 2 }}>
              Talking about: {universeContext.displayLabel}
            </div>
          )}
        </div>
        {/* Explicit close control - the desktop panel can render on top of the orb depending on
            where it's been dragged, so closing must never depend on the orb still being visible
            or clickable underneath it. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close FizzFix Assistant"
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            color: "#8a93a3",
            cursor: "pointer",
            padding: 2,
          }}
        >
          <X size={16} />
        </button>
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
                disabled={sending}
                onClick={() => send(question)}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: "white",
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.5 : 1,
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
                    disabled={sending}
                    onClick={() => send(suggestion.question)}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.12)",
                      background: "white",
                      cursor: sending ? "default" : "pointer",
                      opacity: sending ? 0.5 : 1,
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
            <div
              style={{
                background: "#f0f0f0",
                color: "#0d1117",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                fontStyle: "italic",
              }}
            >
              Thinking…
            </div>
          </div>
        )}
      </div>
      {voice.state.status !== "idle" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 14px",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            fontSize: 12,
            background: voice.state.status === "error" ? "#fff4f4" : "#f7f7f8",
          }}
        >
          {voice.state.status === "requesting-permission" && (
            <span>Requesting microphone access…</span>
          )}
          {voice.state.status === "unsupported" && <span>{voice.state.errorMessage}</span>}
          {voice.state.status === "listening" && (
            <>
              <span>🔴 Listening…</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={voice.stop} style={smallVoiceButtonStyle}>
                  Stop
                </button>
                <button type="button" onClick={voice.cancel} style={smallVoiceButtonStyle}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {voice.state.status === "transcribing" && <span>Transcribing…</span>}
          {voice.state.status === "error" && (
            <>
              <span>{voice.state.errorMessage}</span>
              {voice.state.errorReason === "transcription-failed" && (
                <button
                  type="button"
                  onClick={() => {
                    voiceTapStartRef.current = performance.now();
                    voice.start();
                  }}
                  style={smallVoiceButtonStyle}
                >
                  Try Again
                </button>
              )}
            </>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = input.trim();
          if (!trimmed) return;
          setInput("");
          send(trimmed);
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
        {voice.state.status !== "unsupported" && (
          <button
            type="button"
            onClick={() => {
              if (voice.state.status === "listening") voice.stop();
              else if (voice.state.status === "idle" || voice.state.status === "error") {
                voiceTapStartRef.current = performance.now();
                voice.start();
              }
            }}
            disabled={
              voice.state.status === "transcribing" ||
              voice.state.status === "requesting-permission"
            }
            aria-label={voice.state.status === "listening" ? "Stop recording" : "Ask by voice"}
            style={{
              border: "none",
              background: voice.state.status === "listening" ? "#b91c1c" : "#f0f0f0",
              color: voice.state.status === "listening" ? "white" : "#1c2128",
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {voice.state.status === "transcribing" ||
            voice.state.status === "requesting-permission" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : voice.state.status === "listening" ? (
              <Square size={14} />
            ) : (
              <Mic size={14} />
            )}
          </button>
        )}
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
          // `open` is false on both the server render and the first client render (only a
          // post-hydration pointer event can ever set it true), so this branch - and its
          // `window` reference below - never executes during SSR. See useDraggable.ts's
          // SSR_SAFE_DEFAULT comment for the same reasoning applied to that file.
          <div
            style={{
              position: "fixed",
              // Render above the orb when there's room; otherwise below it. A fixed "always
              // above" position previously let the panel fully cover the orb (and its close
              // icon) whenever the orb sat in roughly the upper half of the viewport, with no
              // other way to dismiss it - this keeps the panel and the orb from ever
              // overlapping regardless of where the GM has dragged it.
              left: Math.min(drag.position.x, window.innerWidth - 336),
              top:
                drag.position.y - 420 >= 16
                  ? drag.position.y - 420
                  : Math.min(drag.position.y + ORB_SIZE + 8, window.innerHeight - 416),
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
