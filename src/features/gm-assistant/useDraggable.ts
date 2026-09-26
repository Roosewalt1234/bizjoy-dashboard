// src/features/gm-assistant/useDraggable.ts
import { useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "gm-assistant-position";
const DRAG_THRESHOLD_PX = 6;

interface Position {
  x: number;
  y: number;
}

function clamp(position: Position, size: number): Position {
  const maxX = Math.max(0, window.innerWidth - size);
  const maxY = Math.max(0, window.innerHeight - size);
  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  };
}

function loadPosition(size: number): Position {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return clamp(JSON.parse(raw), size);
  } catch {
    // localStorage unavailable or the stored value is corrupt - fall through to the default
  }
  return clamp({ x: window.innerWidth - size - 16, y: window.innerHeight - size - 16 }, size);
}

// A default that's safe to compute with no `window` (this app renders under SSR, e.g.
// `src/routes/__root.tsx`). The real position is only ever read from `window`/`localStorage`
// inside `useEffect`, which never runs on the server - same deferral pattern already used by
// this codebase's other browser-only hook, `useIsMobile` (`src/hooks/use-mobile.tsx`).
const SSR_SAFE_DEFAULT: Position = { x: 0, y: 0 };

export function useDraggable(size: number) {
  const [position, setPosition] = useState<Position>(SSR_SAFE_DEFAULT);
  const draggingRef = useRef(false);
  const movedRef = useRef(0);
  const startRef = useRef<Position>({ x: 0, y: 0 });
  const originRef = useRef<Position>({ x: 0, y: 0 });
  // Mirrors `position` for onPointerUp's persistence write, so that write never depends on
  // React's batching/commit timing between the last pointermove and the pointerup that follows
  // it - onPointerMove updates this ref in the same call where it updates state.
  const latestPositionRef = useRef<Position>(SSR_SAFE_DEFAULT);

  useEffect(() => {
    const loaded = loadPosition(size);
    latestPositionRef.current = loaded;
    setPosition(loaded);
    // Runs once on mount to establish the real (browser-only) position; the resize/orientation
    // effect below keeps it in bounds after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleViewportChange() {
      setPosition((current) => {
        const next = clamp(current, size);
        latestPositionRef.current = next;
        return next;
      });
    }
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, [size]);

  function onPointerDown(event: PointerEvent) {
    draggingRef.current = true;
    movedRef.current = 0;
    startRef.current = { x: event.clientX, y: event.clientY };
    originRef.current = position;
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can throw (e.g. the pointer is no longer active) - dragging still
      // works via ordinary event bubbling without it, so this is safe to ignore.
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!draggingRef.current) return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;
    movedRef.current = Math.max(movedRef.current, Math.hypot(dx, dy));
    const next = clamp({ x: originRef.current.x + dx, y: originRef.current.y + dy }, size);
    latestPositionRef.current = next;
    setPosition(next);
  }

  /** Returns true if this pointer-up ended a real drag (caller should NOT treat it as a tap). */
  function onPointerUp(): boolean {
    draggingRef.current = false;
    const wasDrag = movedRef.current > DRAG_THRESHOLD_PX;
    if (wasDrag) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPositionRef.current));
      } catch {
        // localStorage unavailable (private browsing, etc.) - position just won't persist
      }
    }
    return wasDrag;
  }

  return { position, onPointerDown, onPointerMove, onPointerUp };
}
