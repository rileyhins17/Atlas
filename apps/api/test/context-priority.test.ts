import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleRegistryService, type DomainModule } from '../src/core/domain-module.js';

/**
 * Which domain the model stops being able to see, when it cannot see all of
 * them, is a decision — not a consequence of where a line sits in
 * `app.module.ts`.
 *
 * `buildContext` fills a fixed token budget in the order it is handed and trims
 * or drops the rest. The registry used to return modules in NestJS registration
 * order, so a chatty domain early in the import list could push Calendar out
 * entirely and the model would then answer "you have nothing scheduled" with
 * complete confidence.
 */
function fakeModule(id: string, contextPriority?: number): DomainModule {
  return {
    id,
    ...(contextPriority === undefined ? {} : { contextPriority }),
    aiContext: vi.fn(async () => ({
      source: id,
      title: id,
      content: id,
      tokensEstimate: 1,
    })),
    tools: () => [],
  };
}

describe('context ordering', () => {
  it('returns the most important domain first, whatever order they registered in', async () => {
    const registry = new ModuleRegistryService();
    // Registered deliberately backwards.
    registry.register(fakeModule('finance', 100));
    registry.register(fakeModule('tasks', 30));
    registry.register(fakeModule('routine', 10));

    const chunks = await registry.collectContext('u1');
    expect(chunks.map((c) => c.source)).toEqual(['routine', 'tasks', 'finance']);
  });

  /** A new domain should neither starve the important ones nor outrank them. */
  it('puts an unprioritised domain in the middle', async () => {
    const registry = new ModuleRegistryService();
    registry.register(fakeModule('routine', 10));
    registry.register(fakeModule('newcomer'));
    registry.register(fakeModule('finance', 100));

    const chunks = await registry.collectContext('u1');
    expect(chunks.map((c) => c.source)).toEqual(['routine', 'newcomer', 'finance']);
  });

  /** Ties must not reintroduce the registration-order accident. */
  it('breaks a tie by id rather than by registration order', async () => {
    const registry = new ModuleRegistryService();
    registry.register(fakeModule('zebra', 50));
    registry.register(fakeModule('alpha', 50));

    const chunks = await registry.collectContext('u1');
    expect(chunks.map((c) => c.source)).toEqual(['alpha', 'zebra']);
  });

  /**
   * Every real domain declares one. A domain that forgets silently lands in the
   * middle, which is a safe default and a bad thing to discover by accident
   * when the model stops mentioning it.
   */
  it('has an explicit priority for every domain that ships', () => {
    const modules = join(new URL('../src/modules', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const missing: string[] = [];
    let found = 0;

    for (const dir of readdirSync(modules)) {
      const file = join(modules, dir, `${dir}.ai.ts`);
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue; // Not every module plugs into the AI brain.
      }
      found += 1;
      if (!/readonly contextPriority = \d+;/.test(text)) missing.push(dir);
    }

    expect(found).toBeGreaterThan(5);
    expect(
      missing,
      'Add `readonly contextPriority` — see DEFAULT_CONTEXT_PRIORITY for what the ordering means.',
    ).toEqual([]);
  });

  it('gives no two domains the same priority, so the order is fully decided', () => {
    const modules = join(new URL('../src/modules', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const seen = new Map<number, string>();
    const clashes: string[] = [];

    for (const dir of readdirSync(modules)) {
      let text: string;
      try {
        text = readFileSync(join(modules, dir, `${dir}.ai.ts`), 'utf8');
      } catch {
        continue;
      }
      const match = /readonly contextPriority = (\d+);/.exec(text);
      if (!match) continue;
      const value = Number(match[1]);
      const other = seen.get(value);
      if (other) clashes.push(`${dir} and ${other} both claim ${value}`);
      else seen.set(value, dir);
    }
    expect(clashes).toEqual([]);
  });
});
