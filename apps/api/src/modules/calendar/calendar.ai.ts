import { calendarToolSpecs } from '@atlas/shared';
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
    return calendarToolSpecs();
  }
}
