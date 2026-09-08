import { useEffect, useRef, useState } from "react";
import { Plus, X, AlignLeft, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { uid } from "@/services/db";
import { TemplateInput } from "@/components/TemplateInput";
import { parseKVText, serializeKVText } from "@/features/request-body/utils/kv-text";

export function KVEditor({
  list,
  onChange,
  placeholder,
}: {
  list: { id: string; key: string; value: string; enabled: boolean }[];
  onChange: (v: typeof list) => void;
  placeholder: [string, string];
}) {
  const [mode, setMode] = useState<"rows" | "text">("rows");
  // The textarea's displayed value lives here, not derived from `list` on
  // every render — it's fed through a parse/serialize round-trip that isn't
  // a strict identity of what was just typed (e.g. re-normalizes spacing),
  // so binding the textarea straight to `serializeKVText(list)` would fight
  // React's controlled-value reset against the browser's own in-progress
  // edit and scramble fast typing. Re-seeded fresh only when entering text
  // mode, so it can't go stale against edits made in Rows mode.
  const [textDraft, setTextDraft] = useState("");
  // The exact `list` reference textDraft currently reflects. Our own edits
  // (via applyText below) update this to the same array reference passed to
  // onChange, so the next render's `list` prop comes back reference-equal —
  // the effect below sees no change and leaves textDraft alone, avoiding the
  // controlled-value fight the comment above guards against. If `list`
  // changes to a *different* reference while still in text mode — something
  // else wrote to this request's params/headers, e.g. restoring a history
  // entry into the same open tab — the effect re-syncs so a subsequent edit
  // doesn't silently overwrite that change with stale text.
  const syncedListRef = useRef(list);

  useEffect(() => {
    if (mode === "text" && list !== syncedListRef.current) {
      setTextDraft(serializeKVText(list));
      syncedListRef.current = list;
    }
  }, [list, mode]);

  const enterTextMode = () => {
    setTextDraft(serializeKVText(list));
    syncedListRef.current = list;
    setMode("text");
  };

  const update = (id: string, patch: Partial<(typeof list)[number]>) =>
    onChange(list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => onChange(list.filter((i) => i.id !== id));
  const add = () => onChange([...list, { id: uid(), key: "", value: "", enabled: true }]);

  const applyText = (text: string) => {
    setTextDraft(text);
    const next = parseKVText(text).map((row, index) => ({
      id: list[index]?.id ?? uid(),
      ...row,
    }));
    syncedListRef.current = next;
    onChange(next);
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/30 p-0.5">
          <ModeButton
            active={mode === "rows"}
            onClick={() => setMode("rows")}
            title="Edit as rows"
            icon={<Rows3 className="h-3 w-3" />}
          />
          <ModeButton
            active={mode === "text"}
            onClick={enterTextMode}
            title="Edit as text"
            icon={<AlignLeft className="h-3 w-3" />}
          />
        </div>
      </div>
      {mode === "text" ? (
        <textarea
          value={textDraft}
          onChange={(event) => applyText(event.target.value)}
          placeholder={`${placeholder[0]}: ${placeholder[1]}\n# disabled-${placeholder[0].toLowerCase()}: value`}
          spellCheck={false}
          className="h-40 w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 font-mono text-xs leading-relaxed outline-none focus:border-border focus:bg-background"
        />
      ) : (
        <>
          {list.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No entries. Add one to get started.
            </div>
          )}
          {list.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-md hover:bg-accent/40"
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => update(item.id, { enabled: e.target.checked })}
                className="h-3 w-3 accent-[var(--primary)]"
              />
              <TemplateInput
                value={item.key}
                onChange={(key) => update(item.id, { key })}
                placeholder={placeholder[0]}
                className="h-7 flex-1 rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
              />
              <TemplateInput
                value={item.value}
                onChange={(value) => update(item.id, { value })}
                placeholder={placeholder[1]}
                className="h-7 flex-[2] rounded-md border border-transparent bg-transparent px-2 font-mono text-xs outline-none focus:border-border focus:bg-background"
              />
              <button
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.key || placeholder[0].toLowerCase()}`}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={add}
            className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-md transition",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}
