import { db, uid, type Environment, type KV } from "@/services/db";
import {
  persistSession,
  reportDbWriteFailure,
  suggestCopyName,
  suggestEnvironmentName,
} from "@/stores/shared";
import type { SliceCreator } from "@/stores/types";

export interface EnvironmentsSlice {
  createEnvironment: (name: string) => Promise<Environment>;
  updateEnvironment: (
    id: string,
    patch: Partial<Pick<Environment, "name" | "variables">>,
  ) => Promise<void>;
  duplicateEnvironment: (id: string) => Promise<Environment | null>;
  deleteEnvironment: (id: string) => Promise<void>;
  setActiveEnv: (id: string | null) => void;
  updateWorkspaceGlobals: (globals: KV[]) => Promise<void>;
}

export const createEnvironmentsSlice: SliceCreator<EnvironmentsSlice> = (set, get) => ({
  createEnvironment: async (name) => {
    const ws = get().workspace!;
    const finalName =
      name.trim() || suggestEnvironmentName(get().environments.map((env) => env.name));
    const env: Environment = {
      id: uid(),
      workspaceId: ws.id,
      name: finalName,
      variables: [],
      createdAt: Date.now(),
    };
    await reportDbWriteFailure(db.environments.add(env));
    set((s) => ({ environments: [...s.environments, env], activeEnvId: s.activeEnvId ?? env.id }));
    persistSession(get);
    return env;
  },

  updateEnvironment: async (id, patch) => {
    const current = get().environments.find((environment) => environment.id === id);
    if (!current) return;

    const payload: Partial<Pick<Environment, "name" | "variables">> = {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : {}),
      ...(patch.variables ? { variables: patch.variables.map((item) => ({ ...item })) } : {}),
    };

    set((state) => ({
      environments: state.environments.map((environment) =>
        environment.id === id ? { ...environment, ...payload } : environment,
      ),
    }));
    await reportDbWriteFailure(db.environments.update(id, payload));
  },

  duplicateEnvironment: async (id) => {
    const source = get().environments.find((environment) => environment.id === id);
    const workspace = get().workspace;
    if (!source || !workspace) return null;

    const copy: Environment = {
      ...source,
      id: uid(),
      workspaceId: workspace.id,
      name: suggestCopyName(
        source.name,
        get().environments.map((environment) => environment.name),
      ),
      variables: source.variables.map((item) => ({ ...item })),
      createdAt: Date.now(),
    };

    await reportDbWriteFailure(db.environments.add(copy));
    set((state) => ({ environments: [...state.environments, copy] }));
    persistSession(get);
    return copy;
  },

  deleteEnvironment: async (id) => {
    await reportDbWriteFailure(db.environments.delete(id));
    set((state) => {
      const environments = state.environments.filter((environment) => environment.id !== id);
      return {
        environments,
        activeEnvId: state.activeEnvId === id ? (environments[0]?.id ?? null) : state.activeEnvId,
      };
    });
    persistSession(get);
  },

  setActiveEnv: (id) => {
    if (id && !get().environments.some((environment) => environment.id === id)) return;
    set({ activeEnvId: id });
    persistSession(get);
  },

  updateWorkspaceGlobals: async (globals) => {
    const workspace = get().workspace;
    if (!workspace) return;
    const cleaned = globals.map((item) => ({ ...item }));
    await reportDbWriteFailure(db.workspaces.update(workspace.id, { globals: cleaned }));
    set({ workspace: { ...workspace, globals: cleaned } });
  },
});
