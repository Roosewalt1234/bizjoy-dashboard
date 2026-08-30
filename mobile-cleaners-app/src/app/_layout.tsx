import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Redirect, Slot, ThemeProvider, usePathname } from 'expo-router';
import { Pressable, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/hooks/use-auth';
import { registerForPushNotifications } from '@/lib/push-notifications';
import { initScanTracker } from '@/lib/scan-tracker';
import { supabase } from '@/lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { loading, session, employee } = useAuth();

  useEffect(() => {
    initScanTracker();
  }, []);

  useEffect(() => {
    if (employee?.id && employee.status !== 'Terminated') {
      registerForPushNotifications(employee.id);
    }
  }, [employee?.id, employee?.status]);

  const isLoginRoute = pathname === '/login';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ThemedText>Loading...</ThemedText>
        </View>
      ) : !session && !isLoginRoute ? (
        <Redirect href="/login" />
      ) : session && isLoginRoute ? (
        <Redirect href="/" />
      ) : session && !employee && !isLoginRoute ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <ThemedText type="subtitle">Account not linked</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Your login isn't linked to an employee record yet. Ask the office to link your account before you can use
            this app.
          </ThemedText>
          <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}>
            <ThemedText type="link" themeColor="textSecondary">
              Sign out
            </ThemedText>
          </Pressable>
        </View>
      ) : session && employee?.status === 'Terminated' && !isLoginRoute ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <ThemedText type="subtitle">Account deactivated</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Your access has been switched off. Contact the office if you think this is a mistake.
          </ThemedText>
          <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}>
            <ThemedText type="link" themeColor="textSecondary">
              Sign out
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <Slot />
      )}
    </ThemeProvider>
  );
}
