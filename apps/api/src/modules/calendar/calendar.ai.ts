import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { CreateEventInput, type AiContextChunk } from '@atlas/shared';
import { estimateTokens, type ToolOutcome } from '@atlas/ai';
import { DomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import {
  defineTool,
  type DomainTool,
  ByIdInput,
  undoDelete,
  undoPatch,
  undoRecreate,
} from '../../core/domain-tool.js';
import { CalendarService } from './calendar.service.js';

/** Default span when the model gives a start but no end and no duration. */
const DEFAULT_EVENT_MINUTES = 60;

/**
 * What the model may send for an event: `endAt` OR `durationMinutes`. Models
 * are far more reliable at "how long is it" than at arithmetic on end times, so
 * duration is the preferred path and this normalises both into a real endAt.
 */
const AiEventInput = z.object({
  title: z.string().min(1).max(300),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(5_000).optional(),
  recurrence: z.string().max(500).optional(),
});

function toEventInput(raw: unknown): CreateEventInput {
  const parsed = AiEventInput.parse(raw);
  const minutes = parsed.durationMinutes ?? DEFAULT_EVENT_MINUTES;
  const endAt =
    parsed.endAt && parsed.endAt > parsed.startAt
      ? parsed.endAt
      : new Date(parsed.startAt.getTime() + minutes * 60_000);
  return CreateEventInput.parse({
    title: parsed.title,
    startAt: parsed.startAt,
    endAt,
    location: parsed.location,
    description: parsed.description,
    recurrence: parsed.recurrence,
    allDay: false,
  });
}

/** Moving an event: any field may be omitted, and duration still beats endAt. */
const EventPatch = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  location: z.string().max(500).optional(),
});

@Injectable()
export class CalendarAiAdapter implements DomainModule, OnModuleInit {
  readonly id = 'calendar';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 20;

  constructor(
    private readonly calendar: CalendarService,
    private readonly registry: ModuleRegistryService,
  ) {}

  /**
   * Both event tools normalise through the same duration-aware shape; block is
   * just the duration-first phrasing of add.
   */
  private readonly addEvent = async (userId: string, args: unknown): Promise<ToolOutcome> => {
    const event = await this.calendar.create(userId, toEventInput(args));
    return {
      result: event,
      summary: `Scheduled "${event.title}"`,
      undo: undoDelete(`/events/${event.id}`, `Remove "${event.title}"`),
    };
  };

  onModuleInit(): void {
    this.registry.register(this);
  }

  async aiContext(userId: string): Promise<AiContextChunk> {
    const content = await this.calendar.summarize(userId);
    return { source: this.id, title: 'Calendar', content, tokensEstimate: estimateTokens(content) };
  }

  tools(): DomainTool[] {
    return [
      defineTool(
        {
          name: 'calendar.add',
          description:
            "Create a calendar event. Datetimes are the user's LOCAL time (see the Now block) — " +
            'do not convert to UTC. Give either endAt or durationMinutes; if neither is stated, ' +
            'durationMinutes defaults to 60.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              startAt: { type: 'string', format: 'date-time', description: 'Local start time' },
              endAt: {
                type: 'string',
                format: 'date-time',
                description: 'Local end time (optional if durationMinutes given)',
              },
              durationMinutes: {
                type: 'number',
                description: 'How long the event runs, in minutes. Preferred over guessing endAt.',
              },
              location: { type: 'string' },
              recurrence: {
                type: 'string',
                description:
                  'RFC-5545 RRULE for a repeating event, e.g. "FREQ=WEEKLY;BYDAY=MO,WE" or ' +
                  '"FREQ=DAILY;INTERVAL=2". Omit for one-off events.',
              },
            },
            required: ['title', 'startAt'],
          },
        },
        this.addEvent,
      ),
      defineTool(
        {
          name: 'calendar.block',
          description:
            'Reserve a block of time for focused work ("block an hour to review designs"). Same as ' +
            'calendar.add but duration-first — use this when the user is carving out time rather ' +
            'than recording a meeting.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'What the block is for' },
              startAt: { type: 'string', format: 'date-time', description: 'Local start time' },
              durationMinutes: { type: 'number', description: 'Length of the block in minutes' },
            },
            required: ['title', 'startAt', 'durationMinutes'],
          },
        },
        this.addEvent,
      ),
      defineTool(
        {
          name: 'calendar.update',
          description:
            'Move or rename an existing event. Use the id from the Calendar context. Sending only ' +
            'a new startAt keeps the original length, which is what "move my 3pm to 4pm" means.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              startAt: { type: 'string', format: 'date-time', description: 'New local start' },
              durationMinutes: { type: 'integer', description: 'New length, if it changed' },
              location: { type: 'string' },
            },
            required: ['id'],
          },
        },
        async (userId, args) => {
          const parsed = EventPatch.parse(args);
          const before = await this.calendar.owned(userId, parsed.id);
          const start = parsed.startAt ?? before.startAt;
          const end =
            parsed.endAt ??
            (parsed.durationMinutes
              ? new Date(start.getTime() + parsed.durationMinutes * 60_000)
              : // Keep the original length when only the start moved.
                new Date(start.getTime() + (before.endAt.getTime() - before.startAt.getTime())));
          const event = await this.calendar.update(userId, parsed.id, {
            ...(parsed.title ? { title: parsed.title } : {}),
            ...(parsed.location !== undefined ? { location: parsed.location } : {}),
            startAt: start,
            endAt: end,
          });
          return {
            result: event,
            summary: `Moved "${event.title}"`,
            undo: undoPatch(`/events/${parsed.id}`, `Put "${before.title}" back`, {
              title: before.title,
              startAt: before.startAt.toISOString(),
              endAt: before.endAt.toISOString(),
            }),
          };
        },
      ),
      defineTool(
        {
          name: 'calendar.delete',
          description: 'Cancel an event by its id.',
          parameters: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        async (userId, args) => {
          const { id } = ByIdInput.parse(args);
          const before = await this.calendar.owned(userId, id);
          await this.calendar.remove(userId, id);
          return {
            result: { ok: true },
            summary: `Removed "${before.title}"`,
            undo: undoRecreate('/events', `Put "${before.title}" back`, {
              title: before.title,
              startAt: before.startAt.toISOString(),
              endAt: before.endAt.toISOString(),
              ...(before.location ? { location: before.location } : {}),
            }),
          };
        },
      ),
    ];
  }
}
