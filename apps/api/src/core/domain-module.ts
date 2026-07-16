import { Injectable } from '@nestjs/common';
import type { AiContextChunk, AiToolSpec } from '@atlas/shared';

/**
 * The contract every life-domain module implements to plug into the AI brain.
 * Adding a new domain (finance, habits, ...) means writing one of these and
 * registering it — nothing in the core or the AI layer changes.
 */
export interface DomainModule {
  /** Stable id, matches the module folder, e.g. "tasks". */
  readonly id: string;
  /** A compact, token-budgeted summary of this domain for the AI context. */
  aiContext(userId: string): Promise<AiContextChunk>;
  /** Tool specs the AI may call to act on this domain. */
  getToolSpecs(): AiToolSpec[];
}

/**
 * Central registry of domain modules. Each DomainModule registers itself at boot
 * (in its onModuleInit). The AI context builder and tool router read from here,
 * so they never need to know which domains exist.
 */
@Injectable()
export class ModuleRegistryService {
  private readonly modules = new Map<string, DomainModule>();

  register(mod: DomainModule): void {
    this.modules.set(mod.id, mod);
  }

  list(): DomainModule[] {
    return [...this.modules.values()];
  }

  get(id: string): DomainModule | undefined {
    return this.modules.get(id);
  }

  /** Gather every domain's AI context chunk for a user. */
  async collectContext(userId: string): Promise<AiContextChunk[]> {
    return Promise.all(this.list().map((m) => m.aiContext(userId)));
  }

  /** Gather every domain's tool specs. */
  collectToolSpecs(): AiToolSpec[] {
    return this.list().flatMap((m) => m.getToolSpecs());
  }
}
