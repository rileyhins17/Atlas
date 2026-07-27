import { describe, expect, it } from 'vitest';
import { SearchHitDTO, SearchQuery } from '../src/dto/search.js';

describe('SearchQuery', () => {
  it('accepts a normal query', () => {
    expect(SearchQuery.safeParse({ q: 'dentist' }).success).toBe(true);
  });

  it('accepts a single character rather than erroring', () => {
    // The service returns no hits under two characters; that is a ranking
    // decision, not a validation failure.
    expect(SearchQuery.safeParse({ q: 'd' }).success).toBe(true);
  });

  it('rejects an empty or absurd query', () => {
    expect(SearchQuery.safeParse({ q: '' }).success).toBe(false);
    expect(SearchQuery.safeParse({ q: 'x'.repeat(500) }).success).toBe(false);
  });
});

describe('SearchHitDTO', () => {
  it('requires a known domain so the UI can always pick an icon and a link', () => {
    const base = { id: '1', title: 'x', subtitle: 'y', href: '/tasks' };
    expect(SearchHitDTO.safeParse({ ...base, domain: 'task' }).success).toBe(true);
    expect(SearchHitDTO.safeParse({ ...base, domain: 'workout' }).success).toBe(false);
  });
});
