import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AccountService } from './account.service.js';
import { AccountController } from './account.controller.js';

/** Account-level data rights: export everything, or hard-delete the account. */
@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
