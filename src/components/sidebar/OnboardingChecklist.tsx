import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { getRecent } from "@/core/commands/recent";
import { cn } from "@/lib/utils";

const ONBOARDING_DISMISSED_KEY = "reqlo:onboarding-dismissed";
// ensureSeed() (db.ts) always creates exactly 3 sample requests — once the
// workspace has more than that, the user has created one of their own.
const SEEDED_REQUEST_COUNT = 3;

export function OnboardingChecklist({
  requestCount,
  historyCount,
}: {
  requestCount: number;
  historyCount: number;
}) {
  const paletteOpen = useStore((s) => s.overlays.palette);
  const isDark = useIsDarkMode();
  const initialIsDark = useRef(isDark);

  const [dismissed, setDismissed] = useState(
    () =>
      typeof localStorage !== "undefined" && localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1",
  );
  const [usedPalette, setUsedPalette] = useState(() => getRecent().length > 0);
  const [usedTheme, setUsedTheme] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("reqlo:theme") !== null,
  );

  useEffect(() => {
    if (paletteOpen) setUsedPalette(true);
  }, [paletteOpen]);

  useEffect(() => {
    if (isDark !== initialIsDark.current) setUsedTheme(true);
  }, [isDark]);

  const items = [
    { done: historyCount > 0, label: "Send a request" },
    { done: usedPalette, label: "Open the command palette (⌘K)" },
    { done: requestCount > SEEDED_REQUEST_COUNT, label: "Create a request of your own" },
    { done: usedTheme, label: "Try dark mode" },
  ];
  const doneCount = items.filter((item) => item.done).length;
  const complete = doneCount === items.length;

  useEffect(() => {
    if (complete) localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
  }, [complete]);

  if (dismissed || complete) return null;

  return (
    <div className="rounded-xl border border-border/80 bg-background/70 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Getting started
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-3xs text-muted-foreground">
            {doneCount}/{items.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
            }}
            aria-label="Dismiss getting-started checklist"
            className="grid h-4 w-4 place-items-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-2xs">
            {item.done ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            )}
            <span
              className={cn(
                item.done ? "text-muted-foreground line-through" : "text-foreground/80",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
