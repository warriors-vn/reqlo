import { useEffect, useState } from "react";

function computeIsDarkMode() {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Tracks the resolved `.dark` state on `<html>`. Reads the class only — `applyTheme()`
 * (in `lib/theme.ts`) always resolves "system" into an explicit class before this hook
 * ever runs, so falling back to `prefers-color-scheme` here would override an explicit
 * Light/Dark choice whenever it disagreed with the OS, which is what happened before.
 */
export function useIsDarkMode() {
  const [isDark, setIsDark] = useState(computeIsDarkMode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => setIsDark(computeIsDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
