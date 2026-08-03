import { Injectable } from '@nestjs/common';
import { computeAdoption, type ActivityRow, type AdoptionDTO, type SignupRow } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';

/**
 * Product analytics without a tracker.
 *
 * Two grouped queries over rows Atlas already writes. Nothing here is
 * instrumented, nothing leaves the server, and there is no third-party script
 * to disclose — which for an app that holds someone's whole life is the only
 * defensible way to answer "is anyone actually using this".
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async adoption(): Promise<AdoptionDTO> {
    const [signups, activity] = await Promise.all([
      this.prisma.client.$queryRaw<SignupRow[]>`
        SELECT id AS "userId", ("createdAt"::date)::text AS day
        FROM users`,
      // One row per user per day per domain: the grain the adoption maths wants,
      // and small enough to hand back whole even at a few thousand accounts.
      this.prisma.client.$queryRaw<ActivityRow[]>`
        SELECT DISTINCT "userId", ("occurredAt"::date)::text AS day, source
        FROM timeline_events`,
    ]);
    return computeAdoption(signups, activity);
  }
}
