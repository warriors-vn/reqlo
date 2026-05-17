import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BODY_TYPE_OPTIONS, type RequestBodyType } from "@/features/request-body/types";

interface Props {
  value: RequestBodyType;
  onChange: (value: RequestBodyType) => void;
}

export function BodyTypeTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/80 bg-background/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
      {BODY_TYPE_OPTIONS.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "relative rounded-xl px-3 py-1.5 text-[11px] font-medium tracking-tight transition",
            value === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === item.id && (
            <motion.span
              layoutId="body-type-pill"
              className="absolute inset-0 rounded-[11px] bg-accent shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            />
          )}
          <span className="relative z-10">{item.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}
