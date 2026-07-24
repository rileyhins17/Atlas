import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsQuery, type StatsDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { StatsService } from './stats.service.js';

@Controller('stats')
@UseGuards(SessionGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  rollup(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(StatsQuery)) query: StatsQuery,
  ): Promise<StatsDTO> {
    return this.stats.rollup(user.id, query.days);
  }
}
