import type { KV } from "@/services/db";

/**
 * The headers/params a request picks up from its folder and collection, shown
 * read-only above its own. Without this the inherited ones are invisible: the
 * request goes out with headers that appear nowhere in its editor, which is
 * the failure mode that makes inheritance feel like a bug rather than a
 * feature. Editing happens where they're defined, not here.
 */
export function InheritedRows({ rows, kind }: { rows: KV[]; kind: string }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-2">
      <div className="px-1 pb-1.5 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        Inherited — edit in the collection or folder settings
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={`${row.key}-${row.id}`}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 rounded-lg bg-background/60 px-2 py-1.5 text-xs"
            title={`Inherited ${kind}`}
          >
            <span className="truncate font-mono text-muted-foreground">{row.key}</span>
            <span className="truncate font-mono text-muted-foreground/80">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
