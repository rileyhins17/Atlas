import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { CalendarService } from './calendar.service.js';

@Injectable()
export class CalendarAiAdapter extends RegisteredDomainModule {
  readonly id = 'calendar';
  readonly contextTitle = 'Calendar';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 20;

  constructor(
    calendar: CalendarService,
    registry: ModuleRegistryService,
  ) {
    super(registry, calendar);
  }

  getToolSpecs(): AiToolSpec[] {
    return [
      {
        name: 'calendar.add',
        description:
          'Create a calendar event. Datetimes are the user\'s LOCAL time (see the Now block) — ' +
          'do not convert to UTC. Give either endAt or durationMinutes; if neither is stated, ' +
          'durationMinutes defaults to 60.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            startAt: { type: 'string', format: 'date-time', description: "Local start time" },
            endAt: { type: 'string', format: 'date-time', description: 'Local end time (optional if durationMinutes given)' },
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
      {
        name: 'calendar.delete',
        description: 'Cancel an event by its id.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];
  }
}
