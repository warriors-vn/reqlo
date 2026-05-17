import { useRef } from "react";
import { FileArchive, FileUp, Trash2 } from "lucide-react";
import type { BinaryBodyDraft } from "@/features/request-body/types";
import { filesToStoredBlobs, readableFileSize } from "@/features/request-body/utils/body";

interface Props {
  value: BinaryBodyDraft;
  onChange: (value: BinaryBodyDraft) => void;
}

export function BinaryBodyEditor({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const file = value.file;

  return (
    <div className="rounded-[24px] border border-border/75 bg-background/80 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.05)] backdrop-blur-sm">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const files = event.target.files;
          if (!files?.[0]) return;
          const [stored] = await filesToStoredBlobs(files);
          onChange({ file: stored ?? null });
          event.currentTarget.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-xs font-medium text-foreground transition hover:opacity-90"
        >
          <FileUp className="h-3.5 w-3.5" /> Choose binary file
        </button>
        {file && (
          <button
            onClick={() => onChange({ file: null })}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
        {file ? (
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-foreground">
              <FileArchive className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="truncate text-sm font-medium">{file.name}</div>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>{file.type || "application/octet-stream"}</span>
                <span>{readableFileSize(file.size)}</span>
                <span>{new Date(file.lastModified).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Attach a binary file. Reqlo keeps the file draft locally so you can retry without
            rebuilding the payload.
          </div>
        )}
      </div>
    </div>
  );
}
