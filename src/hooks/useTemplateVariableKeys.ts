import { useMemo } from "react";
import { useStore } from "@/stores/useStore";

/**
 * Enabled, named variable keys from the active environment, for template
 * ({{key}}) autocomplete. Named generically (not "active environment") so a
 * future "Global variables" scope can be merged in here without touching
 * every TemplateInput call site.
 */
export function useTemplateVariableKeys(): string[] {
  const environments = useStore((s) => s.environments);
  const activeEnvId = useStore((s) => s.activeEnvId);

  return useMemo(() => {
    const environment = environments.find((env) => env.id === activeEnvId);
    if (!environment) return [];
    const keys = environment.variables.filter((v) => v.enabled && v.key).map((v) => v.key);
    return Array.from(new Set(keys));
  }, [environments, activeEnvId]);
}
