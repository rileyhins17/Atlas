import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { WearablesService } from './wearables.service.js';
import { GoogleHealthController, WearablesController } from './wearables.controller.js';
import { WearablesAiAdapter } from './wearables.ai.js';

/** Fitbit and Pixel Watch data via the Google Health API. */
@Module({
  imports: [AuthModule],
  controllers: [GoogleHealthController, WearablesController],
  providers: [WearablesService, WearablesAiAdapter],
  exports: [WearablesService],
})
export class WearablesModule {}
