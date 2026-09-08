import { isValidTimezone } from '@atlas/shared';
import { serializeSettings as toDto } from '@atlas/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { SettingsDTO, UpdateSettingsInput } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { UserTimezoneService } from '../../core/user-timezone.service.js';

const SELECT = {
  displayName: true,
  timezone: true,
  briefHour: true,
  proactiveEnabled: true,
  weightUnit: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService,
    private readonly timezones: UserTimezoneService,
  ) {}

  async get(userId: string): Promise<SettingsDTO> {
    const row = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: SELECT,
    });
    return toDto(row);
  }

  async update(userId: string, input: UpdateSettingsInput): Promise<SettingsDTO> {
    if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
      throw new BadRequestException(`Unknown timezone: ${input.timezone}`);
    }
    const row = await this.prisma.client.user.update({
      where: { id: userId },
      data: input,
      select: SELECT,
    });
    // Otherwise changing your timezone in Settings appears to do nothing until
    // the next request re-primes the cache.
    if (input.timezone !== undefined) this.timezones.forget(userId);
    return toDto(row);
  }
}
