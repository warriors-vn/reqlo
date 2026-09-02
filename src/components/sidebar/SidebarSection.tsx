import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function SidebarSection({
  icon,
  title,
  count,
  open,
  onToggle,
  draggable,
  dragging,
  dragTargeted,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  actions,
  dropIndicator,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  count: number;
  open: boolean;
  onToggle: () => void;
  draggable?: boolean;
  dragging?: boolean;
  dragTargeted?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: () => void;
  actions?: React.ReactNode;
  dropIndicator?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5">
      <div className="group flex items-center gap-1">
        <button
          onClick={onToggle}
          aria-expanded={open}
          draggable={draggable}
          onDragStart={() => onDragStart?.()}
          onDragEnd={() => onDragEnd?.()}
          onDragOver={onDragOver}
          onDrop={() => onDrop?.()}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-foreground/70 transition hover:bg-accent focus-ring",
            dragTargeted && "bg-primary/6 text-foreground ring-1 ring-primary/20",
          )}
        >
          {draggable ? (
            <GripVertical
              className={cn("h-3.5 w-3.5 text-muted-foreground/70", dragging && "text-primary")}
            />
          ) : null}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{title}</span>
          <span className="text-3xs text-muted-foreground/70">{count}</span>
        </button>
        {actions}
      </div>
      {dropIndicator}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-0.5 border-l border-border pl-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
