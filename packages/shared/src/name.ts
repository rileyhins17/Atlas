/**
 * What Atlas should call you.
 *
 * `User.displayName` exists, the API accepts it, and until now nothing in the UI
 * ever set it — so it was null for every account and Today greeted people with
 * the local part of their email address. That reads fine for `riley@…` and
 * badly for everything else: "Good morning, riley.hinsperger+atlas." or, on a
 * test account, "Good morning, e2e-1786439812956-81051."
 *
 * So a derived name has to EARN its place. An address segment is used only when
 * it actually looks like a name; otherwise Atlas greets you without one, which
 * is warmer than being called a string with a timestamp in it.
 */

/** Longer than this is an address, not a name anyone answers to. */
const MAX_DERIVED = 20;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The first name to greet, or '' when there is nothing worth using.
 *
 * An explicit displayName always wins and is taken at its word — if someone has
 * typed a name, it is not this function's business to second-guess it.
 */
export function firstNameFrom(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const explicit = (displayName ?? '').trim();
  if (explicit) return explicit.split(/\s+/)[0] ?? '';

  const local = (email ?? '').split('@')[0] ?? '';
  // Addresses separate name parts with these; the first segment is the one that
  // stands a chance of being a given name.
  const candidate = local.split(/[.+_-]/)[0] ?? '';

  // Letters only, and long enough to be a name rather than an initial. A digit
  // anywhere is the tell for a generated or role address, and "a" or "hr" is
  // not a person.
  if (!/^[A-Za-z]{2,}$/.test(candidate)) return '';
  if (candidate.length > MAX_DERIVED) return '';

  return capitalize(candidate);
}
