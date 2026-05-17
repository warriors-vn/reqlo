import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CopyPlus, FileUp, GripVertical, Plus, Rows3, TextCursorInput, Trash2 } from "lucide-react";
import { createEmptyFormDataRow, type FormDataRow } from "@/services/db";
import { cn } from "@/lib/utils";
import { filesToStoredBlobs, readableFileSize } from "@/features/request-body/utils/body";

interface Props {
  rows: FormDataRow[];
  onChange: (rows: FormDataRow[]) => void;
}

export function FormDataEditor({ rows, onChange }: Props) {
  const dragRowId = useRef<string | null>(null);

  const updateRow = (id: string, patch: Partial<FormDataRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const addRow = (kind: FormDataRow["kind"] = "text") =>
    onChange([...rows, createEmptyFormDataRow(kind)]);
  const deleteRow = (id: string) => onChange(rows.filter((row) => row.id !== id));
  const duplicateRow = (id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    const row = rows[index];
    const next = rows.slice();
    next.splice(index + 1, 0, {
      ...row,
      id: createEmptyFormDataRow(row.kind).id,
      files: row.files.map((file) => ({ ...file })),
    });
    onChange(next);
  };

  const moveRow = (targetId: string) => {
    const sourceId = dragRowId.current;
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = rows.findIndex((row) => row.id === sourceId);
    const targetIndex = rows.findIndex((row) => row.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = rows.slice();
    const [row] = next.splice(sourceIndex, 1);
    if (!row) return;
    next.splice(targetIndex, 0, row);
    onChange(next);
    dragRowId.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-border/75 bg-[color-mix(in_oklab,var(--surface-elevated)_85%,transparent)] p-2 shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="grid grid-cols-[36px_88px_minmax(120px,1fr)_minmax(180px,1.4fr)_minmax(120px,0.9fr)_100px] gap-2 px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
          <div />
          <div>Status</div>
          <div>Key</div>
          <div>Value / Files</div>
          <div>Content-Type</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <FormDataEditorRow
                key={row.id}
                row={row}
                onChange={(patch) => updateRow(row.id, patch)}
                onDelete={() => deleteRow(row.id)}
                onDuplicate={() => duplicateRow(row.id)}
                onDragStart={() => {
                  dragRowId.current = row.id;
                }}
                onDrop={() => moveRow(row.id)}
                onAddRow={() => addRow(row.kind)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => addRow("text")}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/15 hover:bg-accent/60 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add text field
        </button>
        <button
          onClick={() => addRow("file")}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/15 hover:bg-accent/60 hover:text-foreground"
        >
          <FileUp className="h-3.5 w-3.5" /> Add file field
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  row: FormDataRow;
  onChange: (patch: Partial<FormDataRow>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onAddRow: () => void;
}

function FormDataEditorRow({
  row,
  onChange,
  onDelete,
  onDuplicate,
  onDragStart,
  onDrop,
  onAddRow,
}: RowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextFiles = await filesToStoredBlobs(files);
    onChange({ kind: "file", files: [...row.files, ...nextFiles] });
  };

  return (
    <motion.div
      layout
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16 }}
      className="grid grid-cols-[36px_88px_minmax(120px,1fr)_minmax(180px,1.4fr)_minmax(120px,0.9fr)_100px] items-center gap-2 rounded-[20px] border border-border/70 bg-background/80 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
    >
      <button className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent/70">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          className="h-4 w-4 rounded accent-[var(--primary)]"
        />
        <button
          onClick={() =>
            onChange({
              kind: row.kind === "text" ? "file" : "text",
              value: row.kind === "file" ? row.value : "",
              files: row.kind === "file" ? row.files : [],
            })
          }
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-xl px-2 text-[11px] font-medium transition",
            row.kind === "file"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
          )}
        >
          {row.kind === "file" ? (
            <Rows3 className="h-3.5 w-3.5" />
          ) : (
            <TextCursorInput className="h-3.5 w-3.5" />
          )}
          {row.kind}
        </button>
      </div>
      <input
        value={row.key}
        onChange={(event) => onChange({ key: event.target.value })}
        placeholder="field"
        className={cn(
          "h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
          !row.enabled && "opacity-55",
        )}
      />
      <div>
        {row.kind === "text" ? (
          <input
            value={row.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder="value"
            className={cn(
              "h-10 w-full rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
              !row.enabled && "opacity-55",
            )}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddRow();
              }
            }}
          />
        ) : (
          <div className="space-y-2 rounded-xl border border-dashed border-border/80 bg-muted/35 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:opacity-90"
            >
              <FileUp className="h-3.5 w-3.5" /> Choose files
            </button>
            <div className="flex flex-wrap gap-1.5">
              {row.files.length === 0 && (
                <span className="text-[11px] text-muted-foreground">No files selected</span>
              )}
              {row.files.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[10px] text-foreground shadow-sm"
                >
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <span className="text-muted-foreground">{readableFileSize(file.size)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <input
        value={row.contentType ?? ""}
        onChange={(event) => onChange({ contentType: event.target.value || undefined })}
        placeholder={row.kind === "file" ? "override type" : "optional"}
        className="h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background"
      />
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={onDuplicate}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Duplicate row"
        >
          <CopyPlus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          title="Delete row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
