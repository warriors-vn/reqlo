import { useCallback, useRef, useState } from "react";

// Powers the inline rename UX shared by collections and folders (click a
// pencil, edit in place, blur/Enter to submit). `submit` reads the draft
// through a ref rather than closing over the `draft` state value, so its own
// identity stays stable across every keystroke of the edit — only `rename`
// itself (a store action, already stable) can change it. That matters
// because `submit` is threaded down through FolderTree to every folder row;
// if it changed identity per keystroke, it would defeat the row-level
// memoization those rows rely on.
export function useInlineRename(rename: (id: string, name: string) => Promise<void>) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const start = useCallback((id: string, name: string) => {
    setRenamingId(id);
    setDraft(name);
  }, []);

  const submit = useCallback(
    async (id: string) => {
      const nextName = draftRef.current.trim();
      if (nextName) await rename(id, nextName);
      setRenamingId(null);
      setDraft("");
    },
    [rename],
  );

  const cancel = useCallback(() => {
    setRenamingId(null);
    setDraft("");
  }, []);

  return { renamingId, draft, setDraft, start, submit, cancel };
}
