/**
 * Returns a pretty-printed form of a string value when it is a JSON object or
 * array, otherwise null.
 */
export function tryFormatJson(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}
