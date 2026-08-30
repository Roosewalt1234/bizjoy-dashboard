import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'left',
      }}
    >
      <Stack.Screen name="index" options={{ title: "Today's Tasks" }} />
      <Stack.Screen name="attendance" options={{ title: 'Attendance' }} />
      <Stack.Screen name="checkin/[token]" options={{ title: 'Check In' }} />
      <Stack.Screen name="reactive/[id]" options={{ title: 'Work Order' }} />
    </Stack>
  );
}
