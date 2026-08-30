import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { ReactiveWorkForm } from '@/components/reactive-work-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/hooks/use-auth';
import { fetchWorkOrderById, type ReactiveWorkItem } from '@/lib/reactive-work';

/** Direct completion route for reactive work orders with no linked asset/NFC tag to scan. */
export default function ReactiveWorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { employee } = useAuth();
  const [workOrder, setWorkOrder] = useState<ReactiveWorkItem | null | undefined>(undefined);

  const load = useCallback(async () => {
    setWorkOrder(undefined);
    const wo = await fetchWorkOrderById(id);
    setWorkOrder(wo);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (workOrder === undefined) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!workOrder) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ThemedText type="subtitle">Not found</ThemedText>
      </ThemedView>
    );
  }

  return <ReactiveWorkForm workOrder={workOrder} employeeId={employee?.id ?? null} verified />;
}
