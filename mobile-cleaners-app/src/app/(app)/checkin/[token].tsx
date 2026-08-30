import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PhotoCaptureOverlay, PhotoSlot } from '@/components/photo-capture';
import { SubmitButton, UnverifiedBanner } from '@/components/job-form-controls';
import { ReactiveWorkForm } from '@/components/reactive-work-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { usePhotoCapture } from '@/hooks/use-photo-capture';
import { useTheme } from '@/hooks/use-theme';
import {
  completeJob,
  fetchUtilityRoomsForSection,
  resolveAreaByToken,
  uploadJobPhoto,
  type ResolvedArea,
} from '@/lib/cleaning';
import { completeMepVisit, fetchCurrentVisitForAsset, resolveAssetByToken, uploadMepPhoto } from '@/lib/mep';
import { fetchOpenReactiveWorkForAsset, type ReactiveWorkItem } from '@/lib/reactive-work';
import { wasScannedRecently } from '@/lib/scan-tracker';
import type { CleaningAreaRow, ContractAssetRow, PpmVisitRow, VisitItemStatus } from '@/types/database';

type Resolution =
  | { kind: 'area'; data: ResolvedArea }
  | { kind: 'asset'; data: ContractAssetRow; reactiveWork: ReactiveWorkItem | null }
  | { kind: 'none' };

export default function CheckinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { employee } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const [resolution, setResolution] = useState<Resolution | undefined>(undefined);
  const [utilityRooms, setUtilityRooms] = useState<CleaningAreaRow[] | null>(null);

  const load = useCallback(async () => {
    setResolution(undefined);
    setUtilityRooms(null);
    const area = await resolveAreaByToken(token);
    if (area) {
      setResolution({ kind: 'area', data: area });
      if (area.area.area_type === 'section') {
        const rooms = await fetchUtilityRoomsForSection(area.area.id);
        setUtilityRooms(rooms);
      }
      return;
    }
    const asset = await resolveAssetByToken(token);
    if (!asset) {
      setResolution({ kind: 'none' });
      return;
    }
    const reactiveWork = employee ? await fetchOpenReactiveWorkForAsset(asset.id, employee.id) : null;
    setResolution({ kind: 'asset', data: asset, reactiveWork });
  }, [token, employee]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (resolution === undefined) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (resolution.kind === 'none') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Tag not recognized</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginTop: 8 }}>
          This NFC tag isn't linked to any area or asset. It may have been regenerated - ask the office to reprint it.
        </ThemedText>
      </ThemedView>
    );
  }

  if (resolution.kind === 'asset') {
    if (resolution.reactiveWork) {
      return (
        <ReactiveWorkForm
          workOrder={resolution.reactiveWork}
          employeeId={employee?.id ?? null}
          verified={wasScannedRecently(resolution.data.nfc_token)}
        />
      );
    }
    return <MepCompletionForm asset={resolution.data} employeeId={employee?.id ?? null} />;
  }

  const resolved = resolution.data;

  if (resolved.area.area_type === 'section') {
    return (
      <ThemedView style={{ flex: 1 }}>
        <View style={[styles.sectionHeader, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="subtitle">{resolved.area.name}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {resolved.towerName} · {resolved.floorLabel}
          </ThemedText>
        </View>
        {utilityRooms === null ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : utilityRooms.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={{ padding: 16 }}>
            No utility rooms under this section yet.
          </ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {utilityRooms.map((room) => (
              <Pressable
                key={room.id}
                onPress={() => router.push(`/checkin/${room.nfc_token}`)}
                style={[styles.card, { borderColor: theme.backgroundSelected }]}
              >
                <ThemedText type="smallBold">{room.name}</ThemedText>
                <ThemedText themeColor="textSecondary">Open</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </ThemedView>
    );
  }

  return <JobCompletionForm area={resolved.area} sectionName={resolved.sectionName} employeeId={employee?.id ?? null} />;
}

function JobCompletionForm({
  area,
  sectionName,
  employeeId,
}: {
  area: CleaningAreaRow;
  sectionName: string | null;
  employeeId: string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<VisitItemStatus>('done');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verified, setVerified] = useState(false);
  const photo = usePhotoCapture();

  useEffect(() => {
    setStatus('done');
    setNote('');
    setSubmitted(false);
    photo.reset();
    // Only a real tap on this exact tag unlocks completion - opening this screen via the
    // task list (in-app navigation) shows the form but can't submit it. Re-checked whenever
    // a (possibly reused) screen instance is pointed at a different area.
    setVerified(wasScannedRecently(area.nfc_token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id, area.nfc_token]);

  async function submit() {
    if (!employeeId || !verified) return;
    setSubmitting(true);
    photo.setError(null);
    try {
      const hint = `${area.id}-${Date.now()}`;
      const beforePhotoPath = photo.beforeUri ? await uploadJobPhoto(employeeId, hint, photo.beforeUri, 'before') : null;
      const afterPhotoPath = photo.afterUri ? await uploadJobPhoto(employeeId, hint, photo.afterUri, 'after') : null;
      await completeJob({ area, employeeId, status, note, beforePhotoPath, afterPhotoPath });
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
          {area.name} marked {status}.
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
        <ThemedText type="subtitle">{area.name}</ThemedText>
        {sectionName && <ThemedText themeColor="textSecondary">{sectionName}</ThemedText>}

        {!verified && <UnverifiedBanner />}

        <View style={styles.statusRow}>
          {(['done', 'issue', 'skipped'] as VisitItemStatus[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[
                styles.statusChip,
                { borderColor: theme.backgroundSelected },
                status === s && { backgroundColor: '#208AEF', borderColor: '#208AEF' },
              ]}
            >
              <ThemedText style={status === s ? { color: '#fff' } : undefined} type="smallBold">
                {s === 'done' ? 'Done' : s === 'issue' ? 'Issue' : 'Skipped'}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <View style={styles.photoRow}>
          <PhotoSlot label="Before" uri={photo.beforeUri} onPress={() => photo.takePhoto('before')} />
          <PhotoSlot label="After" uri={photo.afterUri} onPress={() => photo.takePhoto('after')} />
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
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

function MepCompletionForm({ asset, employeeId }: { asset: ContractAssetRow; employeeId: string | null }) {
  const theme = useTheme();
  const router = useRouter();
  const [visit, setVisit] = useState<PpmVisitRow | null | undefined>(undefined);
  const [status, setStatus] = useState<'Completed' | 'Planned'>('Completed');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verified, setVerified] = useState(false);
  const photo = usePhotoCapture();

  useEffect(() => {
    setStatus('Completed');
    setNotes('');
    setSubmitted(false);
    photo.reset();
    setVerified(wasScannedRecently(asset.nfc_token));
    fetchCurrentVisitForAsset(asset.id).then(setVisit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.nfc_token]);

  async function submit() {
    if (!employeeId || !verified) return;
    setSubmitting(true);
    photo.setError(null);
    try {
      const hint = `${asset.id}-${Date.now()}`;
      const beforePhotoPath = photo.beforeUri ? await uploadMepPhoto(employeeId, hint, photo.beforeUri, 'before') : null;
      const afterPhotoPath = photo.afterUri ? await uploadMepPhoto(employeeId, hint, photo.afterUri, 'after') : null;
      await completeMepVisit({ visit: visit ?? null, asset, employeeId, status, notes, beforePhotoPath, afterPhotoPath });
      setSubmitted(true);
    } catch (e) {
      photo.setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (visit === undefined) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (submitted) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="subtitle">Logged</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ marginTop: 8 }}>
          {asset.asset_tag ?? asset.description ?? 'Asset'} marked {status.toLowerCase()}.
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
        <ThemedText type="subtitle">{asset.asset_tag ?? asset.description ?? 'Asset'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {asset.asset_type ?? '-'}
          {asset.location ? ` · ${asset.location}` : ''}
        </ThemedText>
        {!visit && (
          <ThemedText themeColor="textSecondary" type="small" style={{ marginTop: 4 }}>
            No PPM visit is currently due for this asset - this will be logged as an ad-hoc entry.
          </ThemedText>
        )}

        {!verified && <UnverifiedBanner />}

        <View style={styles.statusRow}>
          {(['Completed', 'Planned'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[
                styles.statusChip,
                { borderColor: theme.backgroundSelected },
                status === s && { backgroundColor: '#208AEF', borderColor: '#208AEF' },
              ]}
            >
              <ThemedText style={status === s ? { color: '#fff' } : undefined} type="smallBold">
                {s === 'Completed' ? 'Done' : 'Rescheduled / Issue'}
              </ThemedText>
            </Pressable>
          ))}
        </View>

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
  sectionHeader: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  statusChip: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  photoRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
