import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput } from "react-native";

import { ManagerProjectPicker } from "@/components/manager-project-picker";
import { StaffPhotoGrid } from "@/components/staff-photo-grid";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useActiveProject } from "@/contexts/active-project";
import { useTheme } from "@/hooks/use-theme";
import { setDefaultProject } from "@/lib/device-identity";
import { supabase } from "@/lib/supabase";
import type { ProjectOption, StaffOption } from "@/types/database";

type Step = "admin-login" | "project-pick" | "staff-pick" | "employee-credentials";

export default function ProvisioningScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setActiveProject } = useActiveProject();

  const [step, setStep] = useState<Step>("admin-login");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [project, setProject] = useState<ProjectOption | null>(null);
  const [staff, setStaff] = useState<StaffOption | null>(null);

  const [employeePassword, setEmployeePassword] = useState("");
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  async function signInAsAdmin() {
    if (!adminEmail.trim() || !adminPassword) {
      setAdminError("Enter the admin email and password");
      return;
    }
    setAdminLoading(true);
    setAdminError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail.trim(),
      password: adminPassword,
    });
    if (error || !data.user) {
      setAdminLoading(false);
      setAdminError(error?.message ?? "Sign in failed");
      return;
    }

    const { data: employeeRow, error: lookupError } = await supabase
      .from("employees")
      .select("can_switch_projects")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    setAdminLoading(false);

    if (lookupError || !employeeRow?.can_switch_projects) {
      await supabase.auth.signOut();
      Alert.alert("Not authorized", "This account cannot set up devices. Ask an admin or manager to do this.");
      router.replace("/login");
      return;
    }

    setStep("project-pick");
  }

  async function signInAsEmployee() {
    if (!staff || !employeePassword) {
      setEmployeeError("Enter the password");
      return;
    }
    setEmployeeLoading(true);
    setEmployeeError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: staff.email ?? "",
      password: employeePassword,
    });
    if (error) {
      setEmployeeLoading(false);
      setEmployeeError(error.message);
      return;
    }

    if (project) {
      const defaultProject = { id: project.id, title: project.title };
      await setDefaultProject(defaultProject);
      setActiveProject(defaultProject);
    }

    setEmployeeLoading(false);
    router.replace("/");
  }

  if (step === "admin-login") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Set up this device
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Sign in with an admin or manager account to continue.
        </ThemedText>
        <TextInput
          value={adminEmail}
          onChangeText={setAdminEmail}
          placeholder="Admin email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          value={adminPassword}
          onChangeText={setAdminPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoComplete="password"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        {adminError && <ThemedText style={styles.error}>{adminError}</ThemedText>}
        <Pressable
          onPress={signInAsAdmin}
          disabled={adminLoading}
          style={[styles.button, { opacity: adminLoading ? 0.7 : 1 }]}
        >
          {adminLoading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>Continue</ThemedText>}
        </Pressable>
        <Pressable onPress={() => router.replace("/login")} style={styles.cancel}>
          <ThemedText themeColor="textSecondary">Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (step === "project-pick") {
    return (
      <ManagerProjectPicker
        onSelect={(p) => {
          setProject(p);
          setStep("staff-pick");
        }}
      />
    );
  }

  if (step === "staff-pick" && project) {
    return (
      <StaffPhotoGrid
        contractId={project.id}
        onSelect={(s) => {
          setStaff(s);
          setStep("employee-credentials");
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Sign in {staff?.full_name ?? staff?.first_name}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.subtitle}>
        Enter this employee's password to finish setting up the device.
      </ThemedText>
      <TextInput
        value={staff?.email ?? ""}
        editable={false}
        style={[styles.input, styles.readonly, { color: theme.textSecondary, borderColor: theme.backgroundSelected }]}
      />
      <TextInput
        value={employeePassword}
        onChangeText={setEmployeePassword}
        placeholder="Employee password"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />
      {employeeError && <ThemedText style={styles.error}>{employeeError}</ThemedText>}
      <Pressable
        onPress={signInAsEmployee}
        disabled={employeeLoading}
        style={[styles.button, { opacity: employeeLoading ? 0.7 : 1 }]}
      >
        {employeeLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.buttonText}>Finish setup</ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28 },
  subtitle: { marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  readonly: { opacity: 0.7 },
  error: { color: "#D64545" },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8, backgroundColor: "#208AEF" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancel: { alignItems: "center", padding: 12 },
});
