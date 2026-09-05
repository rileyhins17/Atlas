import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateTrackerInput,
  LogTrackerInput,
  UpdateTrackerInput,
  type TrackerDTO,
  type TrackerEntryDTO,
} from '@atlas/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { TrackersService } from './trackers.service.js';

/** Bounded, because CLAUDE.md requires a bound on every list. */
const HistoryQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(120),
});
const OverviewQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(60),
});
const ListQuery = z.object({
  includeArchived: z.coerce.boolean().default(false),
});

@Controller('trackers')
@UseGuards(SessionGuard)
export class TrackersController {
  constructor(private readonly trackers: TrackersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(ListQuery)) query: ListQuery,
  ): Promise<TrackerDTO[]> {
    return this.trackers.list(user.id, query.includeArchived);
  }

  @Get('overview')
  overview(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(OverviewQuery)) query: OverviewQuery,
  ) {
    return this.trackers.overview(user.id, query.days);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateTrackerInput)) body: CreateTrackerInput,
  ): Promise<TrackerDTO> {
    return this.trackers.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTrackerInput)) body: UpdateTrackerInput,
  ): Promise<TrackerDTO> {
    return this.trackers.update(user.id, id, body);
  }

  @Post(':id/log')
  log(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogTrackerInput)) body: LogTrackerInput,
  ): Promise<TrackerEntryDTO> {
    return this.trackers.log(user.id, id, body);
  }

  @Get(':id/history')
  history(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(HistoryQuery)) query: HistoryQuery,
  ): Promise<TrackerEntryDTO[]> {
    return this.trackers.history(user.id, id, query.days);
  }

  /** Archives rather than deletes — the ratings are the point. */
  @Delete(':id')
  archive(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.trackers.archive(user.id, id);
  }
}

type ListQuery = z.infer<typeof ListQuery>;
type HistoryQuery = z.infer<typeof HistoryQuery>;
type OverviewQuery = z.infer<typeof OverviewQuery>;
