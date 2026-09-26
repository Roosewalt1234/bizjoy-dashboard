import type { CenterEntity } from "@/features/operations-universe/types";

export interface AssistantContext {
  centerEntity: CenterEntity;
  displayLabel: string;
}

export type NavigationCommand =
  | { type: "focus_entity"; entity: CenterEntity }
  | { type: "open_attention" }
  | { type: "go_today" }
  | { type: "go_back" }
  | { type: "search_entity"; query: string };

export interface Suggestion {
  label: string;
  question: string;
}

export interface AssistantResponse {
  answer: string;
  navigation?: NavigationCommand;
  suggestions: Suggestion[];
  /** Only set when the answer reflects a real data query - never on a refusal/clarifying reply. */
  fetchedAt?: string;
}
