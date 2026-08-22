/**
 * Keyboard-shortcut utilities.
 * Shortcut grammar (lowercase, "+"-separated):
 *   mod   → ⌘ on macOS, Ctrl elsewhere
 *   shift → ⇧
 *   alt   → ⌥
 *   ctrl  → ⌃ (explicit)
 *   meta  → ⌘ (explicit)
 *   key   → "k", "enter", "/", etc.
 * Example: "mod+shift+i", "mod+enter", "mod+d"
 */

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export interface ParsedShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  key: string;
}

export function parseShortcut(spec: string): ParsedShortcut {
  const parts = spec
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const out: ParsedShortcut = {
    mod: false,
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    key: "",
  };
  for (const p of parts) {
    if (p === "mod") out.mod = true;
    else if (p === "shift") out.shift = true;
    else if (p === "alt" || p === "option") out.alt = true;
    else if (p === "ctrl") out.ctrl = true;
    else if (p === "meta" || p === "cmd") out.meta = true;
    else out.key = p;
  }
  return out;
}

// Letter keys only change case under Shift, which the `.toLowerCase()` compare
// below already absorbs — so matching still relies on `e.shiftKey` to tell
// "r" from intentional "shift+r". Punctuation doesn't work that way: Shift+/
// reports e.key as "?", an unrelated character, not a capitalized "/". Without
// this map, a spec like "shift+/" would only ever match Shift+/ on a keyboard
// layout where it doesn't (i.e. never, on a standard US layout).
const SHIFTED_KEYS: Record<string, string> = {
  "/": "?",
};

export function eventMatches(spec: string, e: KeyboardEvent): boolean {
  const s = parseShortcut(spec);
  const modKey = IS_MAC ? e.metaKey : e.ctrlKey;
  if (s.mod && !modKey) return false;
  if (!s.mod && (s.meta !== e.metaKey || s.ctrl !== e.ctrlKey)) return false;
  if (s.alt !== e.altKey) return false;
  if (s.shift && SHIFTED_KEYS[s.key]) return e.key === SHIFTED_KEYS[s.key];
  if (s.shift !== e.shiftKey) return false;
  const key = e.key.toLowerCase();
  if (s.key === "enter") return key === "enter";
  if (s.key === "escape") return key === "escape";
  if (s.key === "arrowleft") return key === "arrowleft";
  if (s.key === "arrowright") return key === "arrowright";
  return key === s.key;
}

export function formatShortcut(spec: string): string {
  const s = parseShortcut(spec);
  const out: string[] = [];
  if (s.mod) out.push(IS_MAC ? "⌘" : "Ctrl");
  if (s.meta && !s.mod) out.push("⌘");
  if (s.ctrl && !s.mod) out.push("⌃");
  if (s.alt) out.push(IS_MAC ? "⌥" : "Alt");
  if (s.shift) out.push(IS_MAC ? "⇧" : "Shift");
  const namedKeys: Record<string, string> = {
    enter: "↵",
    backspace: "⌫",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    arrowdown: "↓",
    escape: "Esc",
  };
  const key = namedKeys[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key);
  out.push(key);
  return IS_MAC ? out.join("") : out.join("+");
}
