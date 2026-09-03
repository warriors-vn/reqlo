import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Tailwind max-w utility */
  maxW?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Overlay({ open, onClose, title, subtitle, children, maxW = "max-w-lg" }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // `role="dialog" aria-modal="true"` is advisory — on its own it doesn't stop
  // Tab walking out of the panel and into the sidebar behind the backdrop,
  // where a keyboard user can type into a field they can't see. Radix gives
  // ConfirmDeleteDialog this for free; every Overlay-based modal (Settings,
  // Shortcuts, Runner, Environments, Prompt, Import cURL, History) needs it
  // here instead.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Prefer whatever the panel autofocuses itself (ImportCurlModal and the
    // history search both do); otherwise take the first focusable control, and
    // fall back to the panel so focus at least enters the dialog.
    if (!panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Only take focus back if it's still inside the closing dialog —
      // otherwise the user has already clicked somewhere else deliberately.
      if (previouslyFocused?.isConnected && panel.contains(document.activeElement)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/10 backdrop-blur-sm pt-[12vh]"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className={`glass w-full ${maxW} overflow-hidden rounded-2xl border border-border shadow-2xl outline-none`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold tracking-tight">{title}</div>
                {subtitle && (
                  <div className="truncate text-2xs text-muted-foreground">{subtitle}</div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
