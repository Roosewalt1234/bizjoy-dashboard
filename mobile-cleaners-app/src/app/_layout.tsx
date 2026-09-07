import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, Redirect, Slot, ThemeProvider, usePathname } from 'expo-router';
import { Pressable, useColorScheme, View } from 'react-native';

import { ManagerProjectPicker } from '@/components/manager-project-picker';
import { ScanToast } from '@/components/scan-toast';
import { ThemedText } from '@/components/themed-text';
import { ActiveProjectProvider, useActiveProject } from '@/contexts/active-project';
import { useAuth } from '@/hooks/use-auth';
import { getDefaultProject } from '@/lib/device-identity';
import { registerForPushNotifications } from '@/lib/push-notifications';
import { initScanTracker } from '@/lib/scan-tracker';
import { supabase } from '@/lib/supabase';

export default function RootLayout() {
  return (
    <ActiveProjectProvider>
      <RootLayoutInner />
    </ActiveProjectProvider>
  );
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const { loading, session, employee } = useAuth();
  const { activeProject, setActiveProject } = useActiveProject();
  const [defaultProjectChecked, setDefaultProjectChecked] = useState(false);

  useEffect(() => {
    initScanTracker();
  }, []);

  useEffect(() => {
    if (employee?.id && employee.status !== 'Terminated') {
      registerForPushNotifications(employee.id);
    }
  }, [employee?.id, employee?.status]);

  // Regular (non-flagged) employees: load this device's persisted default project once
  // per employee session. Managers/admins pick fresh every launch (see the render below),
  // so there is nothing to load for them.
  useEffect(() => {
    if (!employee || employee.can_switch_projects) {
      setDefaultProjectChecked(true);
      return;
    }
    let mounted = true;
    setDefaultProjectChecked(false);
    getDefaultProject().then((project) => {
      if (!mounted) return;
      if (project) setActiveProject(project);
      setDefaultProjectChecked(true);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.can_switch_projects]);

  const isLoginRoute = pathname === '/login';
  const isProvisioningRoute = pathname === '/provisioning';
  const needsDefaultProject = !!employee && !employee.can_switch_projects && defaultProjectChecked && !activeProject;
  const needsProjectPick = !!employee && employee.can_switch_projects && !activeProject;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText>Loading...</ThemedText>
          </View>
        ) : !session && !isLoginRoute && !isProvisioningRoute ? (
          <Redirect href="/login" />
        ) : session && isLoginRoute ? (
          <Redirect href="/" />
        ) : session && !employee && !isLoginRoute && !isProvisioningRoute ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
            <ThemedText type="subtitle">Account not linked</ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Your login isn't linked to an employee record yet. Ask the office to link your account before you can
              use this app.
            </ThemedText>
            <Pressable onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}>
              <ThemedText type="link" themeColor="textSecondary">
                Sign out
              </ThemedText>
            </Pressable>
          </View>
        ) : session && employee?.status === 'Terminated' && !isLoginRoute && !isProvisioningRoute ? (
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
        ) : session && employee && !isProvisioningRoute && !defaultProjectChecked ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ThemedText>Loading...</ThemedText>
          </View>
        ) : session && employee && needsDefaultProject && !isProvisioningRoute ? (
          <Redirect href="/provisioning" />
        ) : session && employee && needsProjectPick && !isProvisioningRoute ? (
          <ManagerProjectPicker onSelect={(project) => setActiveProject({ id: project.id, title: project.title })} />
        ) : (
          <Slot />
        )}
        <ScanToast />
      </View>
    </ThemeProvider>
  );
}
