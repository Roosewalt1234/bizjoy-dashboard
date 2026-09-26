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

export function useDraggable(size: number) {
  const [position, setPosition] = useState<Position>(() => loadPosition(size));
  const draggingRef = useRef(false);
  const movedRef = useRef(0);
  const startRef = useRef<Position>({ x: 0, y: 0 });
  const originRef = useRef<Position>({ x: 0, y: 0 });

  useEffect(() => {
    function handleViewportChange() {
      setPosition((current) => clamp(current, size));
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
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!draggingRef.current) return;
    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;
    movedRef.current = Math.max(movedRef.current, Math.hypot(dx, dy));
    setPosition(clamp({ x: originRef.current.x + dx, y: originRef.current.y + dy }, size));
  }

  /** Returns true if this pointer-up ended a real drag (caller should NOT treat it as a tap). */
  function onPointerUp(): boolean {
    draggingRef.current = false;
    const wasDrag = movedRef.current > DRAG_THRESHOLD_PX;
    if (wasDrag) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch {
        // localStorage unavailable (private browsing, etc.) - position just won't persist
      }
    }
    return wasDrag;
  }

  return { position, onPointerDown, onPointerMove, onPointerUp };
}
