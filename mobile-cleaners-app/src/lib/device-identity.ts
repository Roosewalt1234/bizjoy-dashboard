import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@fizfix/default-project";

export type DefaultProject = { id: string; title: string };

/** This device's persisted default project, set once during provisioning. Null until provisioned. */
export async function getDefaultProject(): Promise<DefaultProject | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DefaultProject;
  } catch {
    return null;
  }
}

export async function setDefaultProject(project: DefaultProject): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(project));
}

export async function clearDefaultProject(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
