import { BadRequestException, Injectable } from '@nestjs/common';
import type { SettingsDTO, UpdateSettingsInput } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';

const SELECT = { displayName: true, timezone: true, briefHour: true, proactiveEnabled: true } as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<SettingsDTO> {
    return this.prisma.client.user.findUniqueOrThrow({ where: { id: userId }, select: SELECT });
  }

  async update(userId: string, input: UpdateSettingsInput): Promise<SettingsDTO> {
    if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
      throw new BadRequestException(`Unknown timezone: ${input.timezone}`);
    }
    return this.prisma.client.user.update({ where: { id: userId }, data: input, select: SELECT });
  }
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
