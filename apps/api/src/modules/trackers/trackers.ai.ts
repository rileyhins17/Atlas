import { trackersToolSpecs } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import type { AiToolSpec } from '@atlas/shared';
import { RegisteredDomainModule, ModuleRegistryService } from '../../core/domain-module.js';
import { TrackersService } from './trackers.service.js';

@Injectable()
export class TrackersAiAdapter extends RegisteredDomainModule {
  readonly id = 'trackers';
  readonly contextTitle = 'Personal trackers';
  /** See DEFAULT_CONTEXT_PRIORITY for what this ordering is for. */
  readonly contextPriority = 70;

  constructor(
    trackers: TrackersService,
    registry: ModuleRegistryService,
  ) {
    super(registry, trackers);
  }

  getToolSpecs(): AiToolSpec[] {
    return trackersToolSpecs();
  }
}
