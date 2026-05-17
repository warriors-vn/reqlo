import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CopyPlus, GripVertical, Plus, Trash2 } from "lucide-react";
import { createEmptyKV, type KV } from "@/services/db";
import { cn } from "@/lib/utils";

interface Props {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyLabel?: string;
  valueLabel?: string;
}

export function KeyValueGrid({ rows, onChange, keyLabel = "Key", valueLabel = "Value" }: Props) {
  const dragRowId = useRef<string | null>(null);

  const updateRow = (id: string, patch: Partial<KV>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const deleteRow = (id: string) => onChange(rows.filter((row) => row.id !== id));
  const duplicateRow = (id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    const row = rows[index];
    const copy = { ...row, id: createEmptyKV(row.key, row.value).id };
    const next = rows.slice();
    next.splice(index + 1, 0, copy);
    onChange(next);
  };
  const addRow = () => onChange([...rows, createEmptyKV()]);

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
    <div className="space-y-2">
      <div className="grid grid-cols-[36px_110px_minmax(120px,1fr)_minmax(160px,1.4fr)_108px] gap-2 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        <div />
        <div>On</div>
        <div>{keyLabel}</div>
        <div>{valueLabel}</div>
        <div className="text-right">Actions</div>
      </div>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.div
              key={row.id}
              layout
              draggable
              onDragStart={() => {
                dragRowId.current = row.id;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveRow(row.id)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="grid grid-cols-[36px_110px_minmax(120px,1fr)_minmax(160px,1.4fr)_108px] items-center gap-2 rounded-2xl border border-border/70 bg-background/75 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.03)] backdrop-blur"
            >
              <div className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground hover:bg-accent/70">
                <GripVertical className="h-3.5 w-3.5" />
              </div>
              <label className="flex items-center gap-2 rounded-xl px-2 py-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => updateRow(row.id, { enabled: event.target.checked })}
                  className="h-4 w-4 rounded accent-[var(--primary)]"
                />
                <span>{row.enabled ? "Enabled" : "Off"}</span>
              </label>
              <input
                value={row.key}
                onChange={(event) => updateRow(row.id, { key: event.target.value })}
                placeholder={keyLabel}
                className={cn(
                  "h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                  !row.enabled && "opacity-55",
                )}
              />
              <input
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder={valueLabel}
                className={cn(
                  "h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                  !row.enabled && "opacity-55",
                )}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addRow();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => duplicateRow(row.id)}
                  className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  title="Duplicate row"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteRow(row.id)}
                  className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  title="Delete row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        onClick={addRow}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-foreground/15 hover:bg-accent/60 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Add row
      </button>
    </div>
  );
}
