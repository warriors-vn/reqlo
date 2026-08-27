import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CopyPlus, Eye, EyeOff, GripVertical, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { createEmptyKV, type KV } from "@/services/db";
import { TemplateInput } from "@/components/TemplateInput";
import { cn } from "@/lib/utils";

interface Props {
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  /** Adds a per-row "mark as secret" toggle that masks the value input by default. */
  supportsSecret?: boolean;
  /**
   * Enables {{variable}} autocomplete on the key/value inputs. Off for the
   * environment-variable editor itself: resolveTemplate() only does one
   * substitution pass, so a variable's value referencing another variable
   * would never actually get resolved — suggesting one there would imply
   * nesting that doesn't work.
   */
  templatable?: boolean;
}

export function KeyValueGrid({
  rows,
  onChange,
  keyLabel = "Key",
  valueLabel = "Value",
  supportsSecret = false,
  templatable = true,
}: Props) {
  const dragRowId = useRef<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const toggleRevealed = (id: string) =>
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const gridTemplate = supportsSecret
    ? "grid-cols-[36px_110px_minmax(120px,1fr)_minmax(160px,1.4fr)_40px_108px]"
    : "grid-cols-[36px_110px_minmax(120px,1fr)_minmax(160px,1.4fr)_108px]";

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
      <div
        className={cn(
          "grid gap-2 px-2 text-3xs font-medium uppercase tracking-[0.18em] text-muted-foreground/80",
          gridTemplate,
        )}
      >
        <div />
        <div>On</div>
        <div>{keyLabel}</div>
        <div>{valueLabel}</div>
        {supportsSecret && <div />}
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
              className={cn(
                "grid items-center gap-2 rounded-2xl border border-border/70 bg-background/75 p-2 shadow-[0_8px_30px_rgba(15,23,42,0.03)] backdrop-blur",
                gridTemplate,
              )}
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
              {templatable ? (
                <TemplateInput
                  value={row.key}
                  onChange={(v) => updateRow(row.id, { key: v })}
                  placeholder={keyLabel}
                  className={cn(
                    "h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                    !row.enabled && "opacity-55",
                  )}
                />
              ) : (
                <input
                  value={row.key}
                  onChange={(event) => updateRow(row.id, { key: event.target.value })}
                  placeholder={keyLabel}
                  className={cn(
                    "h-10 rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                    !row.enabled && "opacity-55",
                  )}
                />
              )}
              <div className="relative">
                {templatable ? (
                  <TemplateInput
                    type={row.secret && !revealedIds.has(row.id) ? "password" : "text"}
                    value={row.value}
                    onChange={(v) => updateRow(row.id, { value: v })}
                    placeholder={valueLabel}
                    autoComplete="off"
                    className={cn(
                      "h-10 w-full rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                      row.secret && "pr-9",
                      !row.enabled && "opacity-55",
                    )}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRow();
                      }
                    }}
                  />
                ) : (
                  <input
                    type={row.secret && !revealedIds.has(row.id) ? "password" : "text"}
                    value={row.value}
                    onChange={(event) => updateRow(row.id, { value: event.target.value })}
                    placeholder={valueLabel}
                    autoComplete="off"
                    className={cn(
                      "h-10 w-full rounded-xl border border-transparent bg-muted/40 px-3 font-mono text-xs outline-none transition focus:border-border focus:bg-background",
                      row.secret && "pr-9",
                      !row.enabled && "opacity-55",
                    )}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addRow();
                      }
                    }}
                  />
                )}
                {row.secret && (
                  <button
                    type="button"
                    onClick={() => toggleRevealed(row.id)}
                    className="absolute inset-y-0 right-2 grid place-items-center text-muted-foreground transition hover:text-foreground"
                    title={revealedIds.has(row.id) ? "Hide value" : "Reveal value"}
                  >
                    {revealedIds.has(row.id) ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
              {supportsSecret && (
                <button
                  type="button"
                  onClick={() => updateRow(row.id, { secret: !row.secret })}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl transition",
                    row.secret
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  title={row.secret ? "Marked as secret" : "Mark as secret"}
                >
                  {row.secret ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
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
