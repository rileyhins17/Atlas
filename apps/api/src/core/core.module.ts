import { Global, Module } from '@nestjs/common';
import { CostGuard } from '@atlas/ai';
import { ActivityService } from './activity.service.js';
import { PrismaService } from './prisma.service.js';
import { UserTimezoneService } from './user-timezone.service.js';
import { CryptoService } from './crypto.service.js';
import { TimelineService } from './timeline.service.js';
import { MemoryService } from './memory.service.js';
import { ModuleRegistryService } from './domain-module.js';
import { ConnectorsService } from './connectors.service.js';
import { HealthController } from './health.controller.js';
import { SchemaCheckService } from './schema-check.service.js';

/**
 * Global infrastructure available to every feature module without re-importing:
 * DB, credential crypto, the unified timeline, the domain-module registry, the
 * connector bridge, and the AI cost guard.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    ActivityService,
    UserTimezoneService,
    SchemaCheckService,
    PrismaService,
    CryptoService,
    TimelineService,
    MemoryService,
    ModuleRegistryService,
    ConnectorsService,
    { provide: CostGuard, useFactory: () => CostGuard.fromEnv() },
  ],
  exports: [
    ActivityService,
    UserTimezoneService,
    SchemaCheckService,
    PrismaService,
    CryptoService,
    TimelineService,
    MemoryService,
    ModuleRegistryService,
    ConnectorsService,
    CostGuard,
  ],
})
export class CoreModule {}
