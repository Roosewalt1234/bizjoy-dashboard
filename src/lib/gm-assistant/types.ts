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

export interface PendingAction {
  /** Opaque, HMAC-signed, short-lived - never parsed or trusted client-side. */
  token: string;
  /** Human-readable "Proposed Change" text, already fully formatted for display. */
  preview: string;
  /** Short label for the preview card's header, e.g. "Assign Technician". */
  actionLabel: string;
}

export interface AssistantResponse {
  answer: string;
  navigation?: NavigationCommand;
  suggestions: Suggestion[];
  /** Only set when the answer reflects a real data query - never on a refusal/clarifying reply. */
  fetchedAt?: string;
  /** Set only when a write-action request produced a valid, confirmable preview. */
  pendingAction?: PendingAction;
}
