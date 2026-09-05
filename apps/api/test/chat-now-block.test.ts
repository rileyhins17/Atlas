import { describe, expect, it, vi } from 'vitest';
import { OrchestratorService } from '../src/modules/ai/orchestrator.service.js';

/**
 * Chat has to know what day it is.
 *
 * Reported live: at 3:32pm on a Friday, Atlas said a 3:30 meeting was happening
 * "this afternoon" and could not name the day. Every other AI path in the app
 * builds its prompt through `buildSnapshot`, which puts a `## Now` block at the
 * front; `chat()` was the one path that assembled its own messages and never
 * included it, so it resolved every relative time against training data. The
 * tool descriptions it is handed even say "see the Now block" — which was not
 * there.
 *
 * It belongs at the END of the trailing user message rather than in the system
 * prompt. The block carries the minute, and DeepSeek's discount is a PREFIX
 * cache: at the front it would differ on every message and take the hit rate
 * from ~92% to zero, which is the reason it is easy to leave out and get wrong
 * twice.
 */
const chunk = (source: string, content: string) => ({
  source,
  title: source,
  content,
  tokensEstimate: Math.ceil(content.length / 4),
});

function makeOrchestrator(chunks: ReturnType<typeof chunk>[] = []) {
  const seen: { messages: { role: string; content: string }[] }[] = [];

  const prisma = {
    client: {
      user: {
        findUnique: vi.fn(async () => ({ timezone: 'America/Toronto' })),
      },
    },
  };
  const registry = {
    collectContext: vi.fn(async () => chunks),
    collectToolSpecs: vi.fn(() => []),
  };
  const embeddings = { search: vi.fn(async () => []) };
  const timeline = { recent: vi.fn(async () => []) };
  const costGuard = { assertUnderCap: vi.fn(async () => {}), record: vi.fn(async () => {}) };
  const connectors = {
    contextFor: vi.fn(() => ({})),
    deepseek: {
      chat: vi.fn(async (_ctx: unknown, messages: { role: string; content: string }[]) => {
        seen.push({ messages });
        return {
          content: 'ok',
          toolCalls: [],
          model: 'test',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, cachedPromptTokens: 0 },
        };
      }),
    },
  };

  const service = new OrchestratorService(
    prisma as never,
    timeline as never,
    registry as never,
    connectors as never,
    costGuard as never,
    { execute: vi.fn(async () => ({})) } as never,
    embeddings as never,
    {} as never,
    { estimates: vi.fn(async () => []), energy: vi.fn(async () => null) } as never,
    { get: async () => 'America/Toronto', prime() {}, forget() {} } as never,
  );
  return { service, seen };
}

const lastUserMessage = (messages: { role: string; content: string }[]) =>
  [...messages].reverse().find((m) => m.role === 'user')!.content;

describe('chat is anchored in time', () => {
  it('sends a Now block naming the day, the time and the timezone', async () => {
    const { service, seen } = makeOrchestrator();
    await service.chat('u1', 'what is on today?');

    const sent = lastUserMessage(seen[0]!.messages);
    expect(sent).toContain('## Now');
    expect(sent).toContain('America/Toronto');
    // The actual weekday, so a stale clock cannot pass this.
    const today = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      weekday: 'long',
    }).format(new Date());
    expect(sent).toContain(today);
  });

  /** The reason it is not in the system prompt: the prefix cache. */
  it('keeps the volatile clock out of the cacheable prefix', async () => {
    const { service, seen } = makeOrchestrator();
    await service.chat('u1', 'hello');

    const system = seen[0]!.messages.find((m) => m.role === 'system')!.content;
    expect(system).not.toContain('## Now');
    expect(system).not.toContain('It is currently');
  });

  it('tells the model the Now block is the only authority on the time', async () => {
    const { service, seen } = makeOrchestrator();
    await service.chat('u1', 'hello');
    const system = seen[0]!.messages.find((m) => m.role === 'system')!.content;
    expect(system).toMatch(/only authority on/i);
  });
});

describe('chat is told what its context is missing', () => {
  /**
   * A domain dropped for budget is not a domain with nothing in it, and the
   * model cannot tell those apart unless it is told.
   */
  it('names the sections that did not fit, and says not to treat them as empty', async () => {
    const big = 'x '.repeat(20_000);
    const { service, seen } = makeOrchestrator([
      chunk('tasks', big),
      chunk('calendar', 'Meeting at 3:30pm'),
    ]);
    await service.chat('u1', 'what is on today?');

    const system = seen[0]!.messages.find((m) => m.role === 'system')!.content;
    expect(system).toContain('## Missing from this context');
    expect(system).toContain('calendar');
    expect(system).toMatch(/do not treat\s+them as empty/i);
  });

  it('says nothing at all when everything fitted', async () => {
    const { service, seen } = makeOrchestrator([chunk('tasks', 'Buy milk')]);
    await service.chat('u1', 'hello');
    const system = seen[0]!.messages.find((m) => m.role === 'system')!.content;
    expect(system).not.toContain('## Missing from this context');
  });
});
