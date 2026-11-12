import { createContext, useContext, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const Ctx = createContext({ theme: "light", toggle() {} });
export const useTheme = () => useContext(Ctx);

const initial = () => {
  try { const s = localStorage.getItem("damu_theme"); if (s === "light" || s === "dark") return s; } catch { /* storage blocked */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("damu_theme", theme); } catch { /* storage blocked */ }
  }, [theme]);
  return <Ctx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>{children}</Ctx.Provider>;
}

export function ThemeToggle({ compact }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const Icon = dark ? Sun : Moon;
  return (
    <button className={compact ? "btn ghost sm" : "nl"} onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} mode`}>
      <Icon size={compact ? 16 : 18} />{!compact && (dark ? "Light mode" : "Dark mode")}
    </button>
  );
}