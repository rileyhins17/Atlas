import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TimelineQuery, type TimelinePageDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { TimelineReadService } from './timeline-read.service.js';

@Controller('timeline')
@UseGuards(SessionGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineReadService) {}

  @Get()
  list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(TimelineQuery)) query: TimelineQuery,
  ): Promise<TimelinePageDTO> {
    return this.timeline.list(user.id, query);
  }
}
