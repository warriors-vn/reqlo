import { useMemo } from "react";
import { useStore } from "@/stores/useStore";

/**
 * Enabled, named variable keys from the active environment plus workspace
 * globals, for template ({{key}}) autocomplete.
 */
export function useTemplateVariableKeys(): string[] {
  const environments = useStore((s) => s.environments);
  const activeEnvId = useStore((s) => s.activeEnvId);
  const globals = useStore((s) => s.workspace?.globals);

  return useMemo(() => {
    const environment = environments.find((env) => env.id === activeEnvId);
    const keys = [...(globals ?? []), ...(environment?.variables ?? [])]
      .filter((v) => v.enabled && v.key)
      .map((v) => v.key);
    return Array.from(new Set(keys));
  }, [environments, activeEnvId, globals]);
}
