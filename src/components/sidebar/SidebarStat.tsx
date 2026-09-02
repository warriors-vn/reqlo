export function SidebarStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/70 px-2.5 py-2">
      <div className="text-3xs uppercase tracking-[0.16em] text-muted-foreground/80">{label}</div>
      <div className="mt-1 text-sm font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
