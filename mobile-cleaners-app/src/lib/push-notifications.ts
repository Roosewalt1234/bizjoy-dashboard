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

let registered = false;

/**
 * Requests notification permission, obtains an Expo push token for this device, and saves it on
 * the employee row (send-push-notification edge function reads it from there). Runs once per app
 * session - call whenever the signed-in employee becomes available (see root layout).
 */
export async function registerForPushNotifications(employeeId: string) {
  if (registered) return;
  if (!Device.isDevice) return; // push tokens aren't meaningful on simulators/emulators
  registered = true;
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
    registered = false;
  }
}
