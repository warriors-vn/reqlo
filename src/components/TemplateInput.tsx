import { useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Braces } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useTemplateVariableKeys } from "@/hooks/useTemplateVariableKeys";
import { cn } from "@/lib/utils";

// Matches the token chars resolveTemplate() itself accepts (request-resolver.ts)
// — anything else between "{{" and the caret means the caret has left the
// variable-name token (e.g. a space, or a stray brace).
const TOKEN_RE = /^[\w.-]*$/;
const MAX_SUGGESTIONS = 8;

interface TemplateInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Drop-in replacement for a plain <input> that adds {{variable}} autocomplete
 * against the active environment — the popover opens whenever the caret sits
 * inside an unclosed "{{token", and closes otherwise. Everything else (value,
 * onChange, className, onKeyDown, type, ...) behaves exactly like a native
 * input, so existing call sites only need their tag renamed.
 */
export function TemplateInput({
  value,
  onChange,
  onKeyDown,
  className,
  ...rest
}: TemplateInputProps) {
  const variableKeys = useTemplateVariableKeys();
  const inputRef = useRef<HTMLInputElement>(null);
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (triggerStart === null) return [];
    const q = query.toLowerCase();
    return variableKeys.filter((key) => key.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [triggerStart, query, variableKeys]);

  const open = triggerStart !== null && suggestions.length > 0;

  const close = () => {
    setTriggerStart(null);
    setQuery("");
    setActiveIndex(0);
  };

  const syncFromCaret = (nextValue: string, caret: number) => {
    const upToCaret = nextValue.slice(0, caret);
    const lastOpen = upToCaret.lastIndexOf("{{");
    const lastClose = upToCaret.lastIndexOf("}}");
    if (lastOpen === -1 || lastOpen < lastClose) {
      close();
      return;
    }
    const partial = upToCaret.slice(lastOpen + 2);
    if (!TOKEN_RE.test(partial)) {
      close();
      return;
    }
    setTriggerStart(lastOpen + 2);
    setQuery(partial);
    setActiveIndex(0);
  };

  const applySuggestion = (key: string) => {
    const el = inputRef.current;
    if (!el || triggerStart === null) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, triggerStart);
    const after = value.slice(caret);
    const closing = after.startsWith("}}") ? "" : "}}";
    const next = `${before}${key}${closing}${after}`;
    onChange(next);
    close();
    const cursorPos = before.length + key.length + closing.length;
    requestAnimationFrame(() => {
      el.setSelectionRange(cursorPos, cursorPos);
      el.focus();
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <Popover open={open} onOpenChange={(next) => !next && close()}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            const el = event.target;
            onChange(el.value);
            syncFromCaret(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyDown={handleKeyDown}
          onBlur={close}
          className={className}
          {...rest}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-56 rounded-xl border-border/80 bg-popover p-1 shadow-lg"
      >
        <div className="max-h-56 space-y-0.5 overflow-auto">
          {suggestions.map((key, index) => (
            <button
              key={key}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(key);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition",
                index === activeIndex
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Braces className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{key}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
