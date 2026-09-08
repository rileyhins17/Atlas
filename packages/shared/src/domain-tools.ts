import type { AiToolSpec } from './contracts.js';

// Factories preserve a fresh tool schema for every adapter call.

export function calendarToolSpecs(): AiToolSpec[] {
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

export function financeToolSpecs(): AiToolSpec[] {
  return [];
}

export function fitnessToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'fitness.start_workout',
      description:
        'Start a training session for the user, e.g. when they say they are at the gym ' +
        'or starting a workout. Returns the open session; sets are logged by the user in ' +
        'the app, not by you.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Optional name, e.g. "Push day" or "Legs". Defaults to "Workout".',
          },
        },
        required: [],
      },
    },
  ];
}

export function goalsToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'goals.create',
      description:
        'Record something the user is working toward. horizon "short" is an active push they ' +
        'expect progress on soon; "long" is direction they are steering by. When the user ' +
        'does not say which, infer from ambition rather than from any date: "run a marathon ' +
        'next spring" is short, "be financially independent" is long.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          horizon: { type: 'string', enum: ['short', 'long'] },
          targetDate: { type: 'string', format: 'date-time' },
        },
        required: ['title'],
      },
    },
    {
      name: 'goals.update',
      description:
        'Change a goal, move it between short and long term, or mark it achieved/paused/' +
        'dropped. Use the id from the Goals context.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          horizon: { type: 'string', enum: ['short', 'long'] },
          targetDate: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['active', 'achieved', 'paused', 'dropped'] },
        },
        required: ['id'],
      },
    },
    {
      name: 'goals.delete',
      description:
        'Delete a goal outright. Prefer goals.update with status "achieved" or "dropped" — ' +
        'those keep it in the record, which is the point of having goals at all.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ];
}

export function habitsToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'habits.log',
      description: "Record a check-in for one of the user's habits by its id.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'number', description: 'Amount to log (default 1)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'habits.create',
      description:
        'Start tracking a new habit. Use when the user says they want to start doing something ' +
        'regularly ("I want to read every day").',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cadence: { type: 'string', enum: ['daily', 'weekly'] },
          target: { type: 'integer', description: 'Times per period, default 1' },
        },
        required: ['name'],
      },
    },
    {
      name: 'habits.update',
      description:
        'Rename a habit, change how often it is meant to happen, or pause it by setting ' +
        'active=false. Use the id from the Habits context.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          cadence: { type: 'string', enum: ['daily', 'weekly'] },
          target: { type: 'integer' },
          active: { type: 'boolean', description: 'false pauses it without losing history' },
        },
        required: ['id'],
      },
    },
    {
      name: 'habits.delete',
      description:
        'Stop tracking a habit entirely and remove it from the checklist. This also removes ' +
        'its check-in history — prefer habits.update with active=false when the user just ' +
        'wants it off their plate for now.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ];
}

export function journalToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'journal.add',
      description: 'Append a journal entry for the user (optionally with a 1-5 mood).',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string' },
          mood: { type: 'number', description: '1 (low) to 5 (great)' },
        },
        required: ['body'],
      },
    },
  ];
}

export function notesToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'notes.remember',
      description: 'Save a durable fact about the user (pin it to keep it always in context).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          pinned: { type: 'boolean' },
        },
        required: ['body'],
      },
    },
    {
      name: 'notes.update',
      description: 'Correct or extend an existing note. Use the id from the Notes context.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          pinned: { type: 'boolean', description: 'Pinned notes stay in Atlas context' },
        },
        required: ['id'],
      },
    },
    {
      name: 'notes.delete',
      description: 'Delete a note by its id when the user says it is no longer true or wanted.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ];
}

export function routineToolSpecs(): AiToolSpec[] {
  return [
    {
      // The routine is what makes Today's free time correct — it is the
      // difference between "2pm is open" and "2pm is open because you are
      // not at work". It was previously only reachable through the Settings
      // editor, so "I work 9 to 5" did nothing.
      name: 'routine.add_block',
      description:
        'Add a recurring block to the user\'s typical week — work, school, sleep, a standing ' +
        'commitment. This is what stops Atlas offering time the user does not actually have. ' +
        'Times are MINUTES FROM LOCAL MIDNIGHT (9am = 540, 5pm = 1020). `days` is a 7-bit ' +
        'mask where bit 0 = Monday: weekdays = 31, weekends = 96, every day = 127. ' +
        'startMin greater than endMin means it wraps past midnight, which is how sleep works. ' +
        'Set onDate to pin it to one date instead (a one-off shift, a day off).',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'What it is, e.g. "Work"' },
          kind: {
            type: 'string',
            enum: ['sleep', 'work', 'school', 'meal', 'exercise', 'winddown', 'off', 'custom'],
            description: 'Use "off" to clear the weekly pattern for a window (a day off)',
          },
          days: { type: 'integer', description: '7-bit mask, bit 0 = Monday. Weekdays = 31.' },
          startMin: { type: 'integer', description: 'Minutes from local midnight' },
          endMin: { type: 'integer', description: 'Minutes from local midnight' },
          onDate: { type: 'string', description: 'YYYY-MM-DD to pin this to a single date' },
        },
        required: ['label', 'days', 'startMin', 'endMin'],
      },
    },
    {
      name: 'routine.remove_block',
      description:
        'Remove a block from the typical week ("I do not work Fridays any more"). Use the id ' +
        'from the routine context.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ];
}

export function tasksToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'tasks.create',
      description:
        "Create a task. dueAt is the user's LOCAL time (see the Now block) — do not convert " +
        'to UTC. Set recurrence for anything that repeats.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title' },
          notes: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          dueAt: { type: 'string', format: 'date-time', description: 'Local due date/time' },
          recurrence: {
            type: 'string',
            description:
              'RFC-5545 RRULE for a repeating task, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" ' +
              'for every weekday, or "FREQ=DAILY". Omit for one-off tasks.',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'tasks.update',
      description:
        'Change an existing task: rename it, move its due date, change priority, or edit its ' +
        'notes. Use the id from the Tasks context. Only send the fields that change.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          dueAt: { type: 'string', format: 'date-time', description: 'Local due date/time' },
        },
        required: ['id'],
      },
    },
    {
      name: 'tasks.delete',
      description:
        'Delete a task the user no longer wants. Prefer tasks.complete when they actually did ' +
        'it — deleting loses it from their history.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'tasks.complete',
      description: 'Mark a task as done by its id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ];
}

export function trackersToolSpecs(): AiToolSpec[] {
  return [
    {
      name: 'trackers.log',
      description:
        "Record today's rating for one of the user's personal trackers, by its id. Only for " +
        'trackers that already exist — the id must come from the Personal trackers context. ' +
        'The scale is 1 to 10.',
      parameters: {
        type: 'object',
        properties: {
          trackerId: { type: 'string', description: 'The tracker to rate.' },
          value: { type: 'integer', minimum: 1, maximum: 10 },
          note: { type: 'string', description: 'Optional context in the user\u2019s words.' },
        },
        required: ['trackerId', 'value'],
      },
    },
  ];
}
