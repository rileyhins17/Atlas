import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UpdateSettingsInput, type SettingsDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthedUser): Promise<SettingsDTO> {
    return this.settings.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(UpdateSettingsInput)) body: UpdateSettingsInput,
  ): Promise<SettingsDTO> {
    return this.settings.update(user.id, body);
  }
}
