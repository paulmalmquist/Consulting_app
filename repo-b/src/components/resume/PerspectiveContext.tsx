"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Perspective = "executive" | "engineer" | "investor";

interface PerspectiveCtx {
  perspective: Perspective;
  setPerspective: (p: Perspective) => void;
}

const Ctx = createContext<PerspectiveCtx>({
  perspective: "engineer",
  setPerspective: () => {},
});

export function PerspectiveProvider({ children }: { children: ReactNode }) {
  const [perspective, setPerspective] = useState<Perspective>("engineer");
  return (
    <Ctx.Provider value={{ perspective, setPerspective }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePerspective() {
  return useContext(Ctx);
}
