import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { TimelineReadService } from './timeline-read.service.js';
import { TimelineController } from './timeline.controller.js';

/**
 * Read-only surface over `timeline_events` for the UI's Story view. Not a
 * DomainModule: it produces nothing and owns no domain — every domain already
 * writes here via core/TimelineService.
 */
@Module({
  imports: [AuthModule],
  controllers: [TimelineController],
  providers: [TimelineReadService],
})
export class TimelineModule {}
