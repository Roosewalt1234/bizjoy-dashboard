import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { onAnyScan } from '@/lib/scan-tracker';

const VISIBLE_MS = 2500;

/**
 * Global "tag scanned" confirmation, like a barcode-scan beep - shows the tag's short
 * code the instant a physical tap is detected, regardless of which screen it navigates
 * to next. Mounted once at the app root so it's visible over any screen.
 */
export function ScanToast() {
  const [code, setCode] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return onAnyScan((token) => {
      if (timer.current) clearTimeout(timer.current);
      setCode(token.slice(0, 8).toUpperCase());
      timer.current = setTimeout(() => setCode(null), VISIBLE_MS);
    });
  }, []);

  if (!code) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.banner}>
        <ThemedText style={styles.text}>✓ Tag scanned: {code}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 56,
    zIndex: 999,
  },
  banner: {
    backgroundColor: '#1F9254',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
  },
});
