import type { ConfirmRequest, PromptRequest, SliceCreator } from "@/stores/types";

export interface DialogsSlice {
  // the in-flight window.prompt()/window.confirm() stand-in, if any — set by
  // requestPrompt/requestConfirm and read by PromptDialog/GlobalConfirmDialog,
  // the single global instances of each mounted in Workspace.tsx.
  promptRequest: (PromptRequest & { resolve: (value: string | null) => void }) | null;
  confirmRequest: (ConfirmRequest & { resolve: (value: boolean) => void }) | null;

  // styled window.prompt()/window.confirm() replacements
  requestPrompt: (request: PromptRequest) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
  requestConfirm: (request: ConfirmRequest) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
}

export const createDialogsSlice: SliceCreator<DialogsSlice> = (set, get) => ({
  promptRequest: null,
  confirmRequest: null,

  requestPrompt: (request) =>
    new Promise((resolve) => {
      set({ promptRequest: { ...request, resolve } });
    }),
  resolvePrompt: (value) => {
    get().promptRequest?.resolve(value);
    set({ promptRequest: null });
  },
  requestConfirm: (request) =>
    new Promise((resolve) => {
      set({ confirmRequest: { ...request, resolve } });
    }),
  resolveConfirm: (value) => {
    get().confirmRequest?.resolve(value);
    set({ confirmRequest: null });
  },
});
