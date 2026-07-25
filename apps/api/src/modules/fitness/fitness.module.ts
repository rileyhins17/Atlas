import { Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { FitnessService } from './fitness.service.js';
import { FitnessController } from './fitness.controller.js';
import { FitnessAiAdapter } from './fitness.ai.js';

/**
 * Seeds the shared exercise catalog on boot. Idempotent (`skipDuplicates`), so
 * running it every start is cheap and multiple API replicas can race it safely.
 * Failure is logged, not fatal — a missing catalog degrades the picker, it does
 * not justify refusing to serve the app.
 */
@Injectable()
export class ExerciseCatalogSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExerciseCatalogSeeder.name);

  constructor(private readonly fitness: FitnessService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const added = await this.fitness.seedCatalog();
      if (added > 0) this.logger.log(`Seeded ${added} catalog exercises`);
    } catch (err) {
      this.logger.warn(`Exercise catalog seed skipped: ${(err as Error).message}`);
    }
  }
}

@Module({
  imports: [AuthModule],
  controllers: [FitnessController],
  providers: [FitnessService, FitnessAiAdapter, ExerciseCatalogSeeder],
  exports: [FitnessService],
})
export class FitnessModule {}
