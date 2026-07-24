import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { StatsService } from './stats.service.js';
import { StatsController } from './stats.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
