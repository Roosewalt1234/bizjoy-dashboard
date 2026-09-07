import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTheme } from "@/hooks/use-theme";
import { fetchProjects } from "@/lib/manpower";
import type { ProjectOption } from "@/types/database";

type Props = {
  onSelect: (project: ProjectOption) => void;
};

export function ManagerProjectPicker({ onSelect }: Props) {
  const theme = useTheme();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchProjects()
      .then((rows) => {
        if (mounted) setProjects(rows);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load projects");
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Select a project
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Choose which project you're working from today.
      </ThemedText>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {projects === null ? (
        <ActivityIndicator />
      ) : projects.length === 0 ? (
        <ThemedText themeColor="textSecondary">No projects found.</ThemedText>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {projects.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => onSelect(project)}
              style={[styles.row, { borderColor: theme.backgroundSelected }]}
            >
              <ThemedText type="smallBold">{project.title}</ThemedText>
              {project.site_name && (
                <ThemedText themeColor="textSecondary" type="small">
                  {project.site_name}
                </ThemedText>
              )}
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
  list: { gap: 10, paddingBottom: 24 },
  row: { borderWidth: 1, borderRadius: 12, padding: 16 },
});
