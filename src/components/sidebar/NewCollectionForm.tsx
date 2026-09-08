import { Plus } from "lucide-react";

export function NewCollectionForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-border/80 bg-background/50 p-2">
      <div className="mb-2 flex items-center gap-2 px-1 text-2xs font-medium text-muted-foreground">
        <Plus className="h-3.5 w-3.5" /> New collection
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Collection name"
          aria-label="Collection name"
          className="h-9 min-w-0 flex-1 rounded-xl border border-border/80 bg-background/80 px-3 text-xs outline-none transition focus:border-foreground/15"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
