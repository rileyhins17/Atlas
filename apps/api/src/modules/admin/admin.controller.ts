import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { AdoptionDTO } from '@atlas/shared';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { loadEnv } from '../../config/env.js';
import { AdminService } from './admin.service.js';

/**
 * Owner-only. Gated on an exact email in `ADMIN_EMAIL` rather than a role
 * column: there is one operator, and a role column would be a permission system
 * nobody has asked for yet. With the variable unset NOBODY passes, so the
 * failure mode of forgetting to configure it is a locked door, not an open one.
 */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private assertOwner(user: AuthedUser): void {
    const allowed = loadEnv().ADMIN_EMAIL?.toLowerCase();
    if (!allowed || user.email.toLowerCase() !== allowed) {
      // Deliberately the same answer either way — an admin route that says
      // "wrong account" tells a stranger the route is real.
      throw new ForbiddenException('Not found');
    }
  }

  @Get('adoption')
  async adoption(@CurrentUser() user: AuthedUser): Promise<AdoptionDTO> {
    this.assertOwner(user);
    return this.admin.adoption();
  }
}
