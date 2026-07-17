import { Global, Module } from '@nestjs/common';
import { CostGuard } from '@atlas/ai';
import { PrismaService } from './prisma.service.js';
import { CryptoService } from './crypto.service.js';
import { TimelineService } from './timeline.service.js';
import { MemoryService } from './memory.service.js';
import { ModuleRegistryService } from './domain-module.js';
import { ConnectorsService } from './connectors.service.js';
import { HealthController } from './health.controller.js';

/**
 * Global infrastructure available to every feature module without re-importing:
 * DB, credential crypto, the unified timeline, the domain-module registry, the
 * connector bridge, and the AI cost guard.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    PrismaService,
    CryptoService,
    TimelineService,
    MemoryService,
    ModuleRegistryService,
    ConnectorsService,
    { provide: CostGuard, useFactory: () => CostGuard.fromEnv() },
  ],
  exports: [
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
