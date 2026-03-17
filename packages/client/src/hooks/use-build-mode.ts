import { createContext, useContext } from 'react';

export type BuildMode = 'settlement' | 'city' | 'road' | null;

export interface BuildModeContextValue {
  buildMode: BuildMode;
  setBuildMode: (mode: BuildMode) => void;
}

export const BuildModeContext = createContext<BuildModeContextValue>({
  buildMode: null,
  setBuildMode: () => {},
});

export function useBuildMode() {
  return useContext(BuildModeContext);
}
