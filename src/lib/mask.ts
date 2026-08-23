/** Static preview mask for sensitive values — e.g. "abc••••••yz". Not for editable fields (use a password input for those). */
export function maskPreview(value: string) {
  if (!value) return "(empty)";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(8, value.length - 5))}${value.slice(-2)}`;
}
