/**
 * Supersets — exercises performed back to back, with rest only after the round.
 *
 * A tracker that cannot express this makes you log a paired session as two
 * separate movements and then lies to you twice: the rest timer starts after
 * every single set when the whole point is that you do not rest between them,
 * and the session reads as sequential when it was not.
 *
 * The grouping lives on the TEMPLATE, because that is where a programme decides
 * two movements are paired. It is index-aligned with the exercise list rather
 * than a separate partition, so there is exactly one representation of the fact
 * both on the wire and in the DTO.
 *
 * Pure, so the awkward parts — a group of one, a group split by an unpaired
 * exercise sitting between its members — are tested rather than discovered.
 */

/** An exercise as it sits in a day, with whatever it is paired with. */
export interface GroupableExercise {
  exerciseId: string;
  /** Members of the same group are performed together. Null means on its own. */
  supersetGroup: number | null;
}

/** One thing you do before you rest: a single exercise, or a paired round. */
export interface SupersetRound<T> {
  /** The group these share, or null when this round is a single exercise. */
  group: number | null;
  members: T[];
}

/**
 * Consecutive runs of the same group, in the order given.
 *
 * Deliberately CONSECUTIVE. If an unpaired exercise sits between two members of
 * group 1, they are two rounds, not one — because that is what the ordering
 * says you actually did, and silently reordering someone's session to make the
 * grouping tidy would be inventing history.
 *
 * A run of one is a plain exercise, and reports `group: null` so nothing
 * downstream has to special-case "a superset with a single member".
 */
export function groupIntoRounds<T extends GroupableExercise>(items: T[]): SupersetRound<T>[] {
  const rounds: SupersetRound<T>[] = [];
  for (const item of items) {
    const last = rounds.at(-1);
    if (last && item.supersetGroup !== null && last.group === item.supersetGroup) {
      last.members.push(item);
    } else {
      rounds.push({ group: item.supersetGroup, members: [item] });
    }
  }
  // A group that ended up with one member is not a superset, whatever the
  // stored number says — it renders as an ordinary exercise.
  for (const round of rounds) {
    if (round.members.length < 2) round.group = null;
  }
  return rounds;
}

/** True when this exercise is paired with the one after it in the same round. */
export function isSuperset<T extends GroupableExercise>(round: SupersetRound<T>): boolean {
  return round.group !== null && round.members.length > 1;
}

/**
 * Whether logging a set on this exercise should start the rest timer.
 *
 * The whole point of a superset is that you do NOT rest between its movements,
 * so rest begins only after the last one in the round. Anywhere else and the
 * timer is counting down while you are still working, which is worse than no
 * timer at all.
 */
export function restStartsAfter<T extends GroupableExercise>(
  rounds: SupersetRound<T>[],
  exerciseId: string,
): boolean {
  for (const round of rounds) {
    const i = round.members.findIndex((m) => m.exerciseId === exerciseId);
    if (i === -1) continue;
    return i === round.members.length - 1;
  }
  // Not in the plan at all — added mid-session. Rest normally.
  return true;
}

/** The lowest group number none of `taken` is using. */
function freeGroup(taken: (number | null)[]): number {
  const used = new Set(taken.filter((g): g is number => g !== null));
  let group = 0;
  while (used.has(group)) group += 1;
  return group;
}

/**
 * Pair a run of adjacent exercises, or unpair them if they are already a group.
 *
 * Takes and returns the whole list because grouping is a statement about
 * neighbours: pairing two exercises can split a group that used to span them,
 * and only the full list can say so. `at` is the index of the FIRST of the two.
 */
export function toggleSupersetAt<T extends GroupableExercise>(items: T[], at: number): T[] {
  const a = items[at];
  const b = items[at + 1];
  if (!a || !b) return items;

  const joined = a.supersetGroup !== null && a.supersetGroup === b.supersetGroup;
  if (joined) {
    // Break ONE link, which splits the run in two rather than dissolving it.
    // Unlinking the first pair of a trio has to leave the other two paired —
    // anything else silently undoes a decision the person did not touch.
    const old = a.supersetGroup;
    let start = at;
    while (start > 0 && items[start - 1]!.supersetGroup === old) start -= 1;
    let end = at + 1;
    while (end + 1 < items.length && items[end + 1]!.supersetGroup === old) end += 1;

    // A side left with one member is not a superset, so it loses the number.
    const leftKeeps = at - start + 1 >= 2;
    const rightKeeps = end - at >= 2;
    // Numbers still in use once this run has been reassigned — the run's own
    // old number is free again unless the left half keeps it.
    const elsewhere = items
      .filter((_, i) => i < start || i > end)
      .map((it) => it.supersetGroup);
    const rightGroup = rightKeeps
      ? freeGroup(leftKeeps ? [...elsewhere, old] : elsewhere)
      : null;

    return items.map((it, i) => {
      if (i >= start && i <= at) return { ...it, supersetGroup: leftKeeps ? old : null } as T;
      if (i > at && i <= end) return { ...it, supersetGroup: rightGroup } as T;
      return it;
    });
  }

  // Join. Reuse `a`'s group when it already has one so a third exercise can be
  // appended to an existing pair; otherwise mint a number nothing else uses.
  const group = a.supersetGroup ?? freeGroup(items.map((it) => it.supersetGroup));
  return items.map((it, i) =>
    i === at || i === at + 1 ? ({ ...it, supersetGroup: group } as T) : it,
  );
}

/**
 * Renumber groups to 0,1,2… in the order they first appear.
 *
 * Editing leaves holes (pair, unpair, pair again gives group 2 with no 0 or 1),
 * and the number is shown to people as "Superset A". Called once on save so the
 * stored numbers match what was on screen.
 */
export function normaliseGroups<T extends GroupableExercise>(items: T[]): T[] {
  const rounds = groupIntoRounds(items);
  const remap = new Map<number, number>();
  let next = 0;
  for (const round of rounds) {
    if (round.group === null) continue;
    if (!remap.has(round.group)) remap.set(round.group, next++);
  }
  const singles = new Set(
    rounds.filter((r) => r.group === null).flatMap((r) => r.members.map((m) => m.exerciseId)),
  );
  return items.map((it) => {
    if (it.supersetGroup === null) return it;
    // A group left with one member is not a superset; drop the number.
    if (singles.has(it.exerciseId)) return { ...it, supersetGroup: null };
    return { ...it, supersetGroup: remap.get(it.supersetGroup) ?? null };
  });
}

/** "Superset A", "Superset B" — a letter reads better than an index. */
export function supersetLabel(group: number): string {
  return `Superset ${String.fromCharCode(65 + (group % 26))}`;
}
