/**
 * A tool call reduced to what makes it the same call.
 *
 * Arguments are re-serialised with sorted keys, because the model does not emit
 * them in a stable order and `{"a":1,"b":2}` is the same request as
 * `{"b":2,"a":1}`.
 */
export function toolCallFingerprint(name: string, rawArgs: string | undefined): string {
  let normalised = rawArgs ?? '';
  try {
    const parsed: unknown = rawArgs ? JSON.parse(rawArgs) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      normalised = JSON.stringify(entries);
    }
  } catch {
    // Unparseable arguments fail later anyway; fingerprint the raw string.
  }
  return `${name}::${normalised}`;
}
