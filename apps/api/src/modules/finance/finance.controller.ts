import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateAccountInput,
  CreateTransactionInput,
  PaginationQuery,
  TransactionQuery,
  UpdateTransactionInput,
  type AccountDTO,
  type TransactionDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { FinanceService } from './finance.service.js';

@Controller('finance')
@UseGuards(SessionGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('accounts')
  listAccounts(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(PaginationQuery)) query: PaginationQuery,
  ): Promise<AccountDTO[]> {
    return this.finance.listAccounts(user.id, query);
  }

  @Post('accounts')
  createAccount(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateAccountInput)) body: CreateAccountInput,
  ): Promise<AccountDTO> {
    return this.finance.createAccount(user.id, body);
  }

  @Get('transactions')
  listTransactions(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(TransactionQuery)) query: TransactionQuery,
  ): Promise<TransactionDTO[]> {
    return this.finance.listTransactions(user.id, query);
  }

  @Post('transactions')
  createTransaction(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateTransactionInput)) body: CreateTransactionInput,
  ): Promise<TransactionDTO> {
    return this.finance.createTransaction(user.id, body);
  }

  @Patch('transactions/:id')
  updateTransaction(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTransactionInput)) body: UpdateTransactionInput,
  ): Promise<TransactionDTO> {
    return this.finance.updateTransaction(user.id, id, body);
  }
}
