import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { fetchTodaysTasks, type TaskItem } from '@/lib/cleaning';
import { fetchMyMepTasks, type MepTask } from '@/lib/mep';
import { fetchMyReactiveWork, type ReactiveWorkItem } from '@/lib/reactive-work';
import { supabase } from '@/lib/supabase';

export default function TodaysTasksScreen() {
  const { employee } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [mepTasks, setMepTasks] = useState<MepTask[] | null>(null);
  const [reactiveWork, setReactiveWork] = useState<ReactiveWorkItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!employee) return;
    const [cleaning, mep, reactive] = await Promise.all([
      fetchTodaysTasks(employee.id),
      fetchMyMepTasks(employee.id),
      fetchMyReactiveWork(employee.id),
    ]);
    setTasks(cleaning);
    setMepTasks(mep);
    setReactiveWork(reactive);
  }, [employee]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const pendingCount = tasks?.filter((t) => !t.doneToday).length ?? 0;
  const mepPendingCount = mepTasks?.filter((t) => t.visit).length ?? 0;
  const reactivePendingCount = reactiveWork?.length ?? 0;
  const loading = tasks === null || mepTasks === null || reactiveWork === null;
  const totalPending = pendingCount + mepPendingCount + reactivePendingCount;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderColor: theme.backgroundSelected }]}>
        <View>
          <ThemedText type="subtitle">{employee?.full_name ?? employee?.first_name}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {loading
              ? 'Loading...'
              : totalPending === 0
                ? 'All caught up for today'
                : `${totalPending} job${totalPending === 1 ? '' : 's'} left`}
          </ThemedText>
        </View>
        <Pressable onPress={() => router.push('/attendance')}>
          <ThemedText type="linkPrimary">Attendance</ThemedText>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            REACTIVE WORK
          </ThemedText>
          {reactiveWork!.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No reactive work assigned to you.
            </ThemedText>
          ) : (
            reactiveWork!.map((wo) => (
              <Pressable
                key={wo.id}
                onPress={() => {
                  const token = wo.contract_assets?.nfc_token;
                  if (token) router.push(`/checkin/${token}`);
                  else router.push({ pathname: '/reactive/[id]', params: { id: wo.id } });
                }}
                style={[styles.card, { borderColor: theme.backgroundSelected }]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{wo.wo_no ?? 'Work order'}</ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {wo.service_type || wo.request_type || 'Reactive'}
                    {wo.contract_assets?.asset_tag ? ` · ${wo.contract_assets.asset_tag}` : wo.location ? ` · ${wo.location}` : ''}
                  </ThemedText>
                </View>
                <ThemedText>{wo.status}</ThemedText>
              </Pressable>
            ))
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            CLEANING
          </ThemedText>
          {tasks!.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              Nothing scheduled for you today.
            </ThemedText>
          ) : (
            tasks!.map((item) => (
              <Pressable
                key={item.scheduleId}
                onPress={() => router.push(`/checkin/${item.area.nfc_token}`)}
                style={[styles.card, { borderColor: theme.backgroundSelected, opacity: item.doneToday ? 0.6 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{item.area.name}</ThemedText>
                  <ThemedText themeColor="textSecondary" type="small">
                    {item.towerName} · {item.floorLabel} · {item.frequencyLabel}
                  </ThemedText>
                </View>
                <ThemedText themeColor={item.doneToday ? 'textSecondary' : 'text'}>{item.doneToday ? 'Done' : 'Open'}</ThemedText>
              </Pressable>
            ))
          )}

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
            MEP
          </ThemedText>
          {mepTasks!.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No PPM schedules assigned to you.
            </ThemedText>
          ) : (
            mepTasks!.map((item) => {
              const done = !item.visit;
              return (
                <Pressable
                  key={item.scheduleId}
                  onPress={() => router.push(`/checkin/${item.asset.nfc_token}`)}
                  style={[styles.card, { borderColor: theme.backgroundSelected, opacity: done ? 0.6 : 1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{item.asset.asset_tag ?? item.asset.description ?? 'Asset'}</ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      {item.scheduleName}
                      {item.visit ? ` · Due ${new Date(item.visit.planned_date).toLocaleDateString()}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText themeColor={done ? 'textSecondary' : 'text'}>{done ? 'Up to date' : 'Open'}</ThemedText>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <Pressable onPress={() => supabase.auth.signOut()} style={styles.signOut}>
        <ThemedText themeColor="textSecondary" type="small">
          Sign out
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  sectionTitle: { marginTop: 12, marginBottom: 2, letterSpacing: 0.5 },
  emptyText: { paddingVertical: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  signOut: { alignItems: 'center', padding: 16 },
});
