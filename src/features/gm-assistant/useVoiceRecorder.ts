// src/features/gm-assistant/useVoiceRecorder.ts
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DURATION_MS = 45_000;
const PREFERRED_MIME_TYPE = "audio/webm;codecs=opus";

const UNSUPPORTED_MESSAGE =
  "Voice input isn't supported on this device/browser. You can still type your question.";
const PERMISSION_DENIED_MESSAGE =
  "Microphone access is blocked. You can enable it in your browser settings or type your question.";

export type VoiceRecorderStatus =
  "idle" | "unsupported" | "requesting-permission" | "listening" | "transcribing" | "error";

export type VoiceRecorderErrorReason = "permission-denied" | "transcription-failed";

export interface VoiceRecorderState {
  status: VoiceRecorderStatus;
  errorReason?: VoiceRecorderErrorReason;
  errorMessage?: string;
}

interface UseVoiceRecorderOptions {
  /** Sends the captured clip to the server and resolves with the transcribed text. */
  transcribeAudio: (audioBase64: string, mimeType: string) => Promise<string>;
  /** Called with the transcript once transcription succeeds. Never called with empty text. */
  onTranscript: (text: string) => void;
}

function isVoiceSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function useVoiceRecorder({ transcribeAudio, onTranscript }: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>({ status: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureStartRef = useRef(0);
  // Bumped by every start() and every cancel() (and on unmount). A callback tied to an older
  // recording session - a getUserMedia promise that resolves after cancel(), or a MediaRecorder's
  // onstop firing after a newer start() or an unmount - captures the generation value that was
  // current when IT began, and compares it against this counter before touching any shared
  // ref/state. A mismatch means this session has been superseded, so the callback becomes a
  // no-op instead of clobbering a newer recording or firing transcribeAudio/onTranscript for a
  // canceled one.
  const generationRef = useRef(0);

  // Feature-detect once on mount, not on first tap - an unsupported browser/device should never
  // show a mic button that fails when pressed.
  useEffect(() => {
    if (!isVoiceSupported()) {
      setState({ status: "unsupported", errorMessage: UNSUPPORTED_MESSAGE });
    }
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearMaxDurationTimer() {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  const stop = useCallback(() => {
    clearMaxDurationTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    clearMaxDurationTimer();
    generationRef.current += 1;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    stopTracks();
    recorderRef.current = null;
    chunksRef.current = [];
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (!isVoiceSupported()) {
      setState({ status: "unsupported", errorMessage: UNSUPPORTED_MESSAGE });
      return;
    }
    // Guards against a double-tap/re-entrant call while a previous start() is still in flight -
    // the mic button also disables itself for these states, but this makes the hook safe on its
    // own regardless of how a caller wires it up.
    if (
      state.status === "requesting-permission" ||
      state.status === "listening" ||
      state.status === "transcribing"
    ) {
      return;
    }

    const generation = (generationRef.current += 1);
    setState({ status: "requesting-permission" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (generation !== generationRef.current) return;
      setState({
        status: "error",
        errorReason: "permission-denied",
        errorMessage: PERMISSION_DENIED_MESSAGE,
      });
      return;
    }
    if (generation !== generationRef.current) {
      // cancel() (or a newer start()) ran while this permission prompt was pending - discard
      // this stream immediately rather than let it become the active recording.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE) ? PREFERRED_MIME_TYPE : "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    captureStartRef.current = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      // Bail out BEFORE touching anything shared (the max-duration timer, the mic stream, the
      // chunk buffer) if a newer session has already started - each start()/cancel() call bumps
      // generationRef, so a stale onstop (a canceled or superseded recorder finally finishing
      // its own stop()) would otherwise clear session B's timer and stop session B's live
      // stream out from under it, even though it correctly avoided calling
      // transcribeAudio/onTranscript for itself.
      if (generation !== generationRef.current) return;

      clearMaxDurationTimer();
      stopTracks();
      recorderRef.current = null;
      const chunks = chunksRef.current;
      chunksRef.current = [];

      const captureMs = performance.now() - captureStartRef.current;
      console.debug("[gm-assistant:voice] capture", { ms: Math.round(captureMs) });

      setState({ status: "transcribing" });
      const clip = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      try {
        const transcribeStart = performance.now();
        const audioBase64 = await blobToBase64(clip);
        const text = await transcribeAudio(audioBase64, recorder.mimeType || "audio/webm");
        console.debug("[gm-assistant:voice] transcribe", {
          ms: Math.round(performance.now() - transcribeStart),
        });

        if (generation !== generationRef.current) return;

        if (!text.trim()) {
          setState({
            status: "error",
            errorReason: "transcription-failed",
            errorMessage: "Sorry, I couldn't hear that clearly.",
          });
          return;
        }
        setState({ status: "idle" });
        onTranscript(text.trim());
      } catch {
        if (generation !== generationRef.current) return;
        setState({
          status: "error",
          errorReason: "transcription-failed",
          errorMessage: "Transcription failed.",
        });
      }
    };

    recorder.start();
    setState({ status: "listening" });
    timeoutRef.current = setTimeout(stop, MAX_DURATION_MS);
  }, [transcribeAudio, onTranscript, stop, state.status]);

  // Unmount safety net - never leave a mic stream open if the widget unmounts mid-recording, and
  // invalidate this generation so a still-pending getUserMedia/onstop can't touch state after
  // this component is gone.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      clearMaxDurationTimer();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      stopTracks();
    };
  }, []);

  return { state, start, stop, cancel, maxDurationMs: MAX_DURATION_MS };
}
