import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { fetchTodaysAttendance, toggleAttendance } from '@/lib/attendance';
import type { AttendanceLogRow } from '@/types/database';

export default function AttendanceScreen() {
  const { employee } = useAuth();
  const [today, setToday] = useState<AttendanceLogRow | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employee) return;
    const row = await fetchTodaysAttendance(employee.id);
    setToday(row);
  }, [employee]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onTap() {
    if (!employee) return;
    setSubmitting(true);
    setResult(null);
    try {
      const direction = await toggleAttendance(employee.id, employee.full_name ?? employee.first_name);
      setResult(direction === 'in' ? 'Clocked in' : 'Clocked out');
      await load();
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Failed to record attendance');
    } finally {
      setSubmitting(false);
    }
  }

  const isCheckedIn = !!today?.check_in && !today.check_out;

  return (
    <ThemedView style={styles.container}>
      {today === undefined ? (
        <ActivityIndicator />
      ) : (
        <>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {isCheckedIn ? "You're clocked in" : "You're clocked out"}
          </ThemedText>
          {today?.check_in && (
            <ThemedText themeColor="textSecondary">In: {new Date(today.check_in).toLocaleTimeString()}</ThemedText>
          )}
          {today?.check_out && (
            <ThemedText themeColor="textSecondary">Out: {new Date(today.check_out).toLocaleTimeString()}</ThemedText>
          )}

          <Pressable
            onPress={onTap}
            disabled={submitting}
            style={[styles.button, { backgroundColor: isCheckedIn ? '#D64545' : '#208AEF', opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>{isCheckedIn ? 'Tap to clock out' : 'Tap to clock in'}</ThemedText>
            )}
          </Pressable>

          {result && <ThemedText themeColor="textSecondary">{result}</ThemedText>}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  button: { borderRadius: 999, paddingVertical: 18, paddingHorizontal: 32, marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
