import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The AI budget must not be exhaustible for free, and must not be shared.
 *
 * `POST /ai/dry-run` reports what a prompt WOULD cost and returns
 * `wouldCallModel: false` — it never contacts a provider. It nevertheless wrote
 * its estimate to the same `ai_usage` ledger the cap reads, and never called
 * `assertUnderCap`. Combined with a cap that summed every user together, any
 * signed-in account could spend ~2-3k phantom tokens per request at the global
 * 120 req/min throttle and lock every other user out of AI for the rest of the
 * UTC day, at a real cost of nothing.
 *
 * These are source-level assertions rather than a spun-up Nest app on purpose:
 * the defect is a missing call and a missing decorator, and the thing worth
 * pinning is that they are present.
 */
const root = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const controller = read('modules/ai/ai.controller.ts');

/** The body of one @Post handler, so decorators above it can be inspected. */
function handlerBlock(source: string, route: string): string {
  const at = source.indexOf(`@Post('${route}')`);
  if (at === -1) return '';
  // Back up far enough to catch decorators stacked above the @Post.
  const from = Math.max(0, source.lastIndexOf('\n\n', at));
  const to = source.indexOf('\n  }', at);
  return source.slice(from, to === -1 ? source.length : to);
}

describe('AI endpoints cannot be used to exhaust the budget', () => {
  it('charges the dry run against nothing, or checks the cap before charging', () => {
    const block = handlerBlock(controller, 'dry-run');
    expect(block).not.toBe('');
    const marksUnbilled = /UNBILLED|dry_run/.test(block) && /purpose:\s*'dry_run'/.test(block);
    const checksCap = /assertUnderCap/.test(block);
    // Either is a valid fix; charging a real budget for a call never made is not.
    expect(marksUnbilled || checksCap).toBe(true);
  });

  /**
   * The ledger row is still written — knowing what the prompt weighs is the
   * whole point of the endpoint. It just must not count against money that was
   * never spent, which is enforced in CostGuard.tokensUsedToday.
   */
  it('excludes unbilled purposes from the spend the cap reads', () => {
    const guard = readFileSync(
      join(process.cwd(), '..', '..', 'packages', 'ai', 'src', 'cost-guard.ts'),
      'utf8',
    );
    expect(guard).toMatch(/UNBILLED_PURPOSES/);
    expect(guard).toMatch(/purpose:\s*\{\s*notIn:\s*UNBILLED_PURPOSES/);
  });

  /**
   * Every AI route is expensive and none of them was tightened past the global
   * 120 req/min. Auth and account both set their own limits; these are the
   * endpoints that cost actual money.
   */
  it('rate-limits every AI route that spends tokens', () => {
    for (const route of ['chat', 'brain-dump', 'plan-day', 'weekly-review', 'dry-run']) {
      const block = handlerBlock(controller, route);
      expect(block, `POST /ai/${route} has no @Throttle`).toMatch(/@Throttle\(/);
    }
  });

  /** The cap is per user; a global sum is what let one account lock out the rest. */
  it('passes the user through to the cap check', () => {
    const orchestrator = read('modules/ai/orchestrator.service.ts');
    expect(orchestrator).toMatch(/assertUnderCap\(userId\)/);
    expect(orchestrator).not.toMatch(/assertUnderCap\(\)/);
    const templates = read('modules/fitness/workout-templates.service.ts');
    expect(templates).not.toMatch(/assertUnderCap\(\)/);
  });
});
