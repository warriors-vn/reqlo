import { useEffect, useState } from "react";

function getPreferredSnippetTheme() {
  if (typeof window === "undefined") return "reqlo-snippet-light";
  const hasDarkClass = document.documentElement.classList.contains("dark");
  if (hasDarkClass) return "reqlo-snippet-dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "reqlo-snippet-dark"
    : "reqlo-snippet-light";
}

export function useMonacoSnippetTheme() {
  const [theme, setTheme] = useState(getPreferredSnippetTheme);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(() => setTheme(getPreferredSnippetTheme()));
    const onChange = () => setTheme(getPreferredSnippetTheme());

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    mediaQuery.addEventListener("change", onChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  return theme;
}
