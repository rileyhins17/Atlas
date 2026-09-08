import { tasksToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TasksService } from './tasks.service.js';

/**
 * Bridges the Tasks domain into the AI brain. Copy this file's shape when adding
 * any new domain: extend RegisteredDomainModule and declare its metadata/tools.
 */
@Injectable()
export class TasksAiAdapter extends RegisteredDomainModule {
  readonly id = 'tasks';
  readonly contextTitle = 'Tasks';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 30;

  constructor(
    tasks: TasksService,
    registry: ModuleRegistryService,
  ) {
    super(registry, tasks);
  }

  getToolSpecs(): AiToolSpec[] {
    return tasksToolSpecs();
  }
}
