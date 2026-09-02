import { Moon, Sun } from "lucide-react";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { applyTheme, setStoredTheme } from "@/lib/theme";

export function ThemeSwitch() {
  const isDark = useIsDarkMode();
  return (
    <button
      onClick={() => {
        const next = isDark ? "light" : "dark";
        setStoredTheme(next);
        applyTheme(next);
      }}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
