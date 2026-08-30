import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PhotoCaptureOverlay, PhotoSlot } from '@/components/photo-capture';
import { SubmitButton, UnverifiedBanner } from '@/components/job-form-controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePhotoCapture } from '@/hooks/use-photo-capture';
import { useTheme } from '@/hooks/use-theme';
import { completeReactiveWork, uploadWorkOrderPhoto, type ReactiveWorkItem } from '@/lib/reactive-work';

/**
 * Completion form for a manager-assigned reactive work order. Used both from the NFC checkin
 * flow (when the order has a linked asset with a tag - verified comes from the real tap) and
 * from the plain task-list route for orders with no asset/tag to scan (verified is always true
 * there, since there's no physical tag to enforce against).
 */
export function ReactiveWorkForm({
  workOrder,
  employeeId,
  verified,
}: {
  workOrder: ReactiveWorkItem;
  employeeId: string | null;
  verified: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const photo = usePhotoCapture();

  useEffect(() => {
    setNotes('');
    setSubmitted(false);
    photo.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrder.id]);

  async function submit() {
    if (!employeeId || !verified) return;
    setSubmitting(true);
    photo.setError(null);
    try {
      const hint = `${workOrder.id}-${Date.now()}`;
      const beforePhotoPath = photo.beforeUri ? await uploadWorkOrderPhoto(employeeId, hint, photo.beforeUri, 'before') : null;
      const afterPhotoPath = photo.afterUri ? await uploadWorkOrderPhoto(employeeId, hint, photo.afterUri, 'after') : null;
      await completeReactiveWork({ workOrder, employeeId, notes, beforePhotoPath, afterPhotoPath });
      setSubmitted(true);
    } catch (e) {
      photo.setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Logged</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ marginTop: 8 }}>
          {workOrder.wo_no ?? 'Work order'} marked completed.
        </ThemedText>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: 24 }}>
          <ThemedText type="linkPrimary">Back to tasks</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.list}>
        <ThemedText type="subtitle">{workOrder.wo_no ?? 'Reactive work'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {workOrder.service_type || workOrder.request_type || 'Reactive'}
          {workOrder.contract_assets?.asset_tag
            ? ` · ${workOrder.contract_assets.asset_tag}`
            : workOrder.location
              ? ` · ${workOrder.location}`
              : ''}
        </ThemedText>
        {workOrder.problem_reported && (
          <ThemedText themeColor="textSecondary" type="small" style={{ marginTop: 4 }}>
            {workOrder.problem_reported}
          </ThemedText>
        )}

        {!verified && <UnverifiedBanner />}

        <View style={styles.photoRow}>
          <PhotoSlot label="Before" uri={photo.beforeUri} onPress={() => photo.takePhoto('before')} />
          <PhotoSlot label="After" uri={photo.afterUri} onPress={() => photo.takePhoto('after')} />
        </View>

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.notesInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {photo.error && <ThemedText style={{ color: '#D64545' }}>{photo.error}</ThemedText>}

        <SubmitButton submitting={submitting} verified={verified} disabled={!employeeId} onPress={submit} />
      </ScrollView>

      <PhotoCaptureOverlay pendingShot={photo.pendingShot} shotRef={photo.shotRef} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  photoRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top' },
});
