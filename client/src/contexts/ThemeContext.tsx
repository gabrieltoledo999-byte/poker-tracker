import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

export type AccentColor = "purple" | "cyan" | "green" | "orange" | "red" | "pink" | "blue";

export const ACCENT_COLORS: Record<AccentColor, { label: string; hue: number; chroma: number; hex: string }> = {
  purple: { label: "Roxo",    hue: 290, chroma: 0.22, hex: "#a855f7" },
  cyan:   { label: "Ciano",   hue: 195, chroma: 0.20, hex: "#06b6d4" },
  green:  { label: "Verde",   hue: 160, chroma: 0.20, hex: "#10b981" },
  blue:   { label: "Azul",    hue: 250, chroma: 0.22, hex: "#3b82f6" },
  orange: { label: "Laranja", hue: 50,  chroma: 0.20, hex: "#f59e0b" },
  red:    { label: "Vermelho",hue: 25,  chroma: 0.22, hex: "#ef4444" },
  pink:   { label: "Rosa",    hue: 320, chroma: 0.22, hex: "#ec4899" },
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem("theme");
      return (stored as Theme) || defaultTheme;
    }
    return defaultTheme;
  });

  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    const stored = localStorage.getItem("accentColor");
    return (stored as AccentColor) || "purple";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENT_COLORS[accentColor];
    const { hue: h, chroma: c } = accent;
    // Apply accent as CSS custom properties (overrides index.css values)
    root.style.setProperty("--primary", `oklch(0.62 ${c} ${h})`);
    root.style.setProperty("--ring", `oklch(0.72 ${c * 0.9} ${h})`);
    root.style.setProperty("--sidebar-primary", `oklch(0.62 ${c} ${h})`);
    root.style.setProperty("--sidebar-ring", `oklch(0.62 ${c} ${h})`);
    localStorage.setItem("accentColor", accentColor);
  }, [accentColor]);

  const toggleTheme = switchable
    ? () => setTheme(prev => (prev === "light" ? "dark" : "light"))
    : undefined;

  const setAccentColor = (color: AccentColor) => setAccentColorState(color);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
