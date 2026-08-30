import type { RefObject } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatTimestamp, type PendingShot } from '@/hooks/use-photo-capture';

export function PhotoSlot({ label, uri, onPress }: { label: string; uri: string | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.photoSlot, { borderColor: theme.backgroundSelected }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.photoPreview} />
      ) : (
        <ThemedText themeColor="textSecondary" type="small">
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

/** Off-screen view that PendingShot gets rendered into and snapshotted from - see usePhotoCapture. */
export function PhotoCaptureOverlay({ pendingShot, shotRef }: { pendingShot: PendingShot | null; shotRef: RefObject<View | null> }) {
  if (!pendingShot) return null;
  return (
    <View
      ref={shotRef}
      collapsable={false}
      style={{ position: 'absolute', top: -10000, left: -10000, width: pendingShot.width, height: pendingShot.height }}
    >
      <Image source={{ uri: pendingShot.uri }} style={{ width: pendingShot.width, height: pendingShot.height }} />
      <View style={styles.timestampBadge}>
        <Text style={[styles.timestampText, { fontSize: Math.max(12, Math.round(pendingShot.height * 0.028)) }]}>
          {formatTimestamp(new Date())}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: '100%' },
  timestampBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timestampText: { color: '#fff', fontWeight: '600' },
});
