export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "reqlo:theme";

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function setStoredTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage write failures in private mode or quota-constrained environments.
  }
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

/**
 * Inlined into __root.tsx as a blocking <script> so the correct class is set
 * before first paint/hydration — without this, the page always renders light
 * first and flashes to dark a beat later for anyone who has dark selected.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||((t===null||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
