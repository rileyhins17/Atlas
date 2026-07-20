import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { FinanceService } from './finance.service.js';
import { FinanceController } from './finance.controller.js';
import { FinanceAiAdapter } from './finance.ai.js';
import { PlaidController } from './plaid.controller.js';
import { PlaidSyncService } from './plaid-sync.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FinanceController, PlaidController],
  providers: [FinanceService, FinanceAiAdapter, PlaidSyncService],
  exports: [FinanceService],
})
export class FinanceModule {}
