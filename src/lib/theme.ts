"use client";

import { useEffect, useState } from "react";
import type { ThemeName } from "./types";

export const THEMES: { id: ThemeName; label: string; swatch: string }[] = [
  { id: "instrument", label: "Instrument", swatch: "#f7f9fe" }
];

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>("instrument");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return { theme, setTheme };
}
