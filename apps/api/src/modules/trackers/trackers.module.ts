import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { TrackersService } from './trackers.service.js';
import { TrackersController } from './trackers.controller.js';
import { TrackersAiAdapter } from './trackers.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [TrackersController],
  providers: [TrackersService, TrackersAiAdapter],
  exports: [TrackersService],
})
export class TrackersModule {}
