import * as Linking from "expo-linking";

/**
 * Tracks whether the app was opened/resumed via an actual external NFC tap (a real
 * https://.../checkin/<token> deep link), as opposed to in-app navigation (e.g. tapping a
 * task in "Today's Tasks"). Job completion is gated on this - see checkin/[token].tsx -
 * so a cleaner can't just browse to a job and mark it done without physically scanning the tag.
 *
 * This is a client-side signal only, not a cryptographic guarantee - a determined user could
 * still work around it - but it stops the common case (marking things done from memory/home).
 */
let lastExternalScan: { token: string; at: number } | null = null;

// Notified whenever a scan is recorded, so UI already mounted before the async
// 'url' event resolves can react instead of being stuck with a stale one-time check.
// See use-nfc-verified.ts - this is what fixes the race between a completion
// screen mounting (as part of the same navigation the tap triggered) and this
// module actually finishing processing that tap's URL.
type ScanListener = (token: string) => void;
const listeners = new Set<ScanListener>();

function extractToken(url: string): string | null {
  try {
    const { path } = Linking.parse(url);
    if (!path) return null;
    const match = path.match(/checkin\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function recordIfCheckin(url: string | null) {
  if (!url) return;
  const token = extractToken(url);
  if (!token) return;
  lastExternalScan = { token, at: Date.now() };
  listeners.forEach((listener) => listener(token));
}

let initialized = false;

/** Call once near app startup (root layout) to start listening for external tag taps. */
export function initScanTracker() {
  if (initialized) return;
  initialized = true;
  Linking.getInitialURL().then(recordIfCheckin);
  Linking.addEventListener("url", (event) => recordIfCheckin(event.url));
}

/** True if this exact token was opened via a real external link within the last few seconds. */
export function wasScannedRecently(token: string, withinMs = 120_000): boolean {
  if (!lastExternalScan) return false;
  if (lastExternalScan.token !== token) return false;
  return Date.now() - lastExternalScan.at < withinMs;
}

/** Subscribe to future scans of this token. Returns an unsubscribe function. */
export function onScanned(token: string, callback: () => void): () => void {
  const listener: ScanListener = (scannedToken) => {
    if (scannedToken === token) callback();
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe to every scan regardless of token - used for the global "tag scanned" toast. */
export function onAnyScan(callback: (token: string) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
