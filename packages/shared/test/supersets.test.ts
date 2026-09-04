import { describe, expect, it } from 'vitest';
import {
  groupIntoRounds,
  isSuperset,
  normaliseGroups,
  restStartsAfter,
  supersetLabel,
  toggleSupersetAt,
} from '../src/dto/supersets.js';

const ex = (exerciseId: string, supersetGroup: number | null = null) => ({
  exerciseId,
  supersetGroup,
});

const groups = (items: { exerciseId: string; supersetGroup: number | null }[]) =>
  items.map((i) => i.supersetGroup);

describe('groupIntoRounds', () => {
  it('leaves unpaired exercises as rounds of one', () => {
    const rounds = groupIntoRounds([ex('bench'), ex('row')]);
    expect(rounds).toHaveLength(2);
    expect(rounds.every((r) => r.group === null)).toBe(true);
  });

  it('puts a pair in one round', () => {
    const rounds = groupIntoRounds([ex('curl', 0), ex('pushdown', 0), ex('bench')]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]!.members.map((m) => m.exerciseId)).toEqual(['curl', 'pushdown']);
    expect(isSuperset(rounds[0]!)).toBe(true);
    expect(isSuperset(rounds[1]!)).toBe(false);
  });

  /**
   * The ordering is what you actually did. Two members of one group with an
   * unpaired exercise between them are two rounds — quietly reordering the
   * session to make the grouping tidy would be inventing history.
   */
  it('does not reach across an exercise that sits between group members', () => {
    const rounds = groupIntoRounds([ex('curl', 0), ex('squat'), ex('pushdown', 0)]);
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.group === null)).toBe(true);
  });

  /** A stored group number with nothing to pair with is not a superset. */
  it('treats a group of one as an ordinary exercise', () => {
    const rounds = groupIntoRounds([ex('curl', 3)]);
    expect(rounds[0]!.group).toBeNull();
    expect(isSuperset(rounds[0]!)).toBe(false);
  });

  it('handles three in a row', () => {
    const rounds = groupIntoRounds([ex('a', 1), ex('b', 1), ex('c', 1)]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.members).toHaveLength(3);
  });
});

describe('restStartsAfter', () => {
  /** The point of a superset is that you do not rest inside it. */
  it('waits until the last movement of the round', () => {
    const rounds = groupIntoRounds([ex('curl', 0), ex('pushdown', 0), ex('bench')]);
    expect(restStartsAfter(rounds, 'curl')).toBe(false);
    expect(restStartsAfter(rounds, 'pushdown')).toBe(true);
    expect(restStartsAfter(rounds, 'bench')).toBe(true);
  });

  /** Added mid-session, so it is in no round. Rest normally rather than never. */
  it('rests normally for an exercise that is not in the plan', () => {
    const rounds = groupIntoRounds([ex('curl', 0), ex('pushdown', 0)]);
    expect(restStartsAfter(rounds, 'lateral-raise')).toBe(true);
  });
});

describe('toggleSupersetAt', () => {
  it('pairs two neighbours', () => {
    const next = toggleSupersetAt([ex('a'), ex('b'), ex('c')], 0);
    expect(groups(next)).toEqual([0, 0, null]);
  });

  it('extends an existing pair rather than starting a second group', () => {
    const next = toggleSupersetAt([ex('a', 0), ex('b', 0), ex('c')], 1);
    expect(groups(next)).toEqual([0, 0, 0]);
  });

  it('unpairs a pair it is given again', () => {
    const next = toggleSupersetAt([ex('a', 0), ex('b', 0)], 0);
    expect(groups(next)).toEqual([null, null]);
  });

  /**
   * Splits the run at the link that was tapped rather than dissolving it —
   * unlinking one pair must not silently undo a decision nobody touched.
   */
  it('splits a trio at the link that was tapped', () => {
    const head = toggleSupersetAt([ex('a', 0), ex('b', 0), ex('c', 0)], 0);
    expect(groups(head)).toEqual([null, 0, 0]);
    const tail = toggleSupersetAt([ex('a', 0), ex('b', 0), ex('c', 0)], 1);
    expect(groups(tail)).toEqual([0, 0, null]);
  });

  /** Both halves survive when a four-exercise run is split down the middle. */
  it('keeps both halves paired when a longer run is split', () => {
    const next = toggleSupersetAt([ex('a', 0), ex('b', 0), ex('c', 0), ex('d', 0)], 1);
    expect(groups(next)).toEqual([0, 0, 1, 1]);
  });

  it('mints a number nothing else is using', () => {
    const next = toggleSupersetAt([ex('a', 0), ex('b', 0), ex('c'), ex('d')], 2);
    expect(groups(next)).toEqual([0, 0, 1, 1]);
  });

  it('does nothing at the end of the list', () => {
    const items = [ex('a'), ex('b')];
    expect(toggleSupersetAt(items, 1)).toBe(items);
  });
});

describe('normaliseGroups', () => {
  /** Pair, unpair, pair again leaves holes — and the number is shown as a letter. */
  it('renumbers from zero in the order they appear', () => {
    const next = normaliseGroups([ex('a', 5), ex('b', 5), ex('c'), ex('d', 2), ex('e', 2)]);
    expect(groups(next)).toEqual([0, 0, null, 1, 1]);
  });

  it('drops a number from a group that has only one member', () => {
    expect(groups(normaliseGroups([ex('a', 4), ex('b')]))).toEqual([null, null]);
  });

  it('leaves an already-tidy list alone', () => {
    const items = [ex('a', 0), ex('b', 0), ex('c')];
    expect(groups(normaliseGroups(items))).toEqual([0, 0, null]);
  });
});

describe('supersetLabel', () => {
  it('reads as a letter, not an index', () => {
    expect(supersetLabel(0)).toBe('Superset A');
    expect(supersetLabel(1)).toBe('Superset B');
  });
});
