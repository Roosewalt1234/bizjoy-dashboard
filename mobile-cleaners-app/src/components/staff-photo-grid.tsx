import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchProjectStaff } from "@/lib/manpower";
import type { StaffOption } from "@/types/database";

type Props = {
  contractId: string;
  onSelect: (staff: StaffOption) => void;
};

function initials(staff: StaffOption): string {
  const name = staff.full_name || staff.first_name || "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function StaffPhotoGrid({ contractId, onSelect }: Props) {
  const theme = useTheme();
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setStaff(null);
    fetchProjectStaff(contractId)
      .then((rows) => {
        if (mounted) setStaff(rows);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load staff");
      });
    return () => {
      mounted = false;
    };
  }, [contractId]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Select the employee
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Tap this device's owner.
      </ThemedText>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {staff === null ? (
        <ActivityIndicator />
      ) : staff.length === 0 ? (
        <ThemedText themeColor="textSecondary">No staff assigned to this project yet.</ThemedText>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {staff.map((person) => (
            <Pressable key={person.id} onPress={() => onSelect(person)} style={styles.tile}>
              {person.profile_photo ? (
                <Image source={{ uri: person.profile_photo }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.placeholder, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="subtitle">{initials(person)}</ThemedText>
                </View>
              )}
              <ThemedText type="small" style={styles.name} numberOfLines={1}>
                {person.full_name || person.first_name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 28 },
  subtitle: { marginBottom: 16 },
  error: { color: "#D64545" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingBottom: 24 },
  tile: { width: 96, alignItems: "center", gap: 6 },
  photo: { width: 84, height: 84, borderRadius: 42 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  name: { textAlign: "center" },
});
