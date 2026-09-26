import type { AssistantContext, NavigationCommand } from "./types";

let currentContext: AssistantContext | undefined;
let navigationHandler: ((command: NavigationCommand) => void) | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setUniverseContext(context: AssistantContext | undefined): void {
  currentContext = context;
  notify();
}

export function getUniverseContext(): AssistantContext | undefined {
  return currentContext;
}

/** Returns false (and does nothing) if nothing is currently registered - i.e. the GM isn't on the Universe route. */
export function dispatchNavigationCommand(command: NavigationCommand): boolean {
  if (!navigationHandler) return false;
  navigationHandler(command);
  return true;
}

export function onNavigationCommand(handler: (command: NavigationCommand) => void): () => void {
  navigationHandler = handler;
  return () => {
    if (navigationHandler === handler) navigationHandler = undefined;
  };
}

/** For useSyncExternalStore, so the widget's "Talking about: X" header stays live. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
