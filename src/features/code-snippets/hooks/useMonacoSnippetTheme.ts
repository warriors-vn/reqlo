import { useIsDarkMode } from "@/hooks/useIsDarkMode";

export function useMonacoSnippetTheme() {
  return useIsDarkMode() ? "reqlo-snippet-dark" : "reqlo-snippet-light";
}
