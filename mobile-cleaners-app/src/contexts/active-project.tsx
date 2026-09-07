import { createContext, useContext, useState, type ReactNode } from "react";

export type ActiveProject = { id: string; title: string } | null;

type ActiveProjectContextValue = {
  activeProject: ActiveProject;
  setActiveProject: (project: ActiveProject) => void;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProject] = useState<ActiveProject>(null);
  return (
    <ActiveProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

/** Which project the current app session is "working from" - see docs/superpowers/specs/2026-09-07-mobile-device-provisioning-design.md. */
export function useActiveProject(): ActiveProjectContextValue {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ActiveProjectProvider");
  return ctx;
}
