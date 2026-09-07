import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredForEmployeeId: string | null = null;

/**
 * Requests notification permission, obtains an Expo push token for this device, and saves it on
 * the employee row (send-push-notification edge function reads it from there). Runs once per
 * signed-in employee per app session - call whenever the signed-in employee becomes available
 * (see root layout). Scoped per employee id (not a single session-wide flag) because the device
 * provisioning flow signs in as two different people (admin, then the target employee) within one
 * app session, and both need their own token registered.
 */
export async function registerForPushNotifications(employeeId: string) {
  if (registeredForEmployeeId === employeeId) return;
  if (!Device.isDevice) return; // push tokens aren't meaningful on simulators/emulators
  registeredForEmployeeId = employeeId;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await supabase.from("employees").update({ expo_push_token: token }).eq("id", employeeId);
  } catch (e) {
    console.error("Failed to register for push notifications", e);
    registeredForEmployeeId = null;
  }
}
