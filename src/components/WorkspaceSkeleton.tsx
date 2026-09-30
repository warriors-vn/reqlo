// Shown while the store hydrates from IndexedDB (Workspace.tsx's `!ready`
// branch). Traces the eventual layout — sidebar, tab strip, request builder,
// response pane — instead of a bare loading line, so the app doesn't flash
// from "nothing" to "everything" once hydration finishes.
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-screen w-screen overflow-hidden" aria-hidden="true">
      <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-[var(--surface)]">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <div className="h-6 w-6 animate-pulse rounded-lg bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="px-3 pb-2">
          <div className="h-8 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden px-2 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-7 animate-pulse rounded-md bg-muted"
              style={{ opacity: 1 - i * 0.08, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 items-center gap-1.5 border-b border-border bg-[var(--surface)] px-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 w-28 animate-pulse rounded-md bg-muted" />
          ))}
        </div>

        <div className="flex flex-col gap-3 border-b border-border bg-[var(--surface-elevated)] px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded-lg bg-muted" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 w-14 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-full animate-pulse rounded-xl bg-muted" />
        </div>
      </main>
    </div>
  );
}
