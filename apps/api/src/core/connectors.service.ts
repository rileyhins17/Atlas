import { Injectable } from '@nestjs/common';
import {
  ConnectorRegistry,
  OpenRouterConnector,
  type Connector,
  type ConnectorContext,
} from '@atlas/connectors';
import type { Prisma } from '@atlas/db';
import { PrismaService } from './prisma.service.js';
import { CryptoService } from './crypto.service.js';

/**
 * Owns the ConnectorRegistry and bridges connectors to stored, encrypted
 * credentials. A connector never sees the DB or the encryption key: it receives
 * a ConnectorContext whose getSecret() decrypts on demand.
 *
 * Register every new connector here (or from its module) so it shows up in
 * Settings and can be used by the AI/sync layers.
 */
@Injectable()
export class ConnectorsService {
  private readonly registry = new ConnectorRegistry();
  readonly openrouter = new OpenRouterConnector();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    this.registry.register(this.openrouter);
  }

  list(): Connector[] {
    return this.registry.list();
  }

  get(id: string): Connector | undefined {
    return this.registry.get(id);
  }

  /** Build a ConnectorContext bound to a user's stored credential. */
  contextFor(userId: string, connectorId: string, label = 'default'): ConnectorContext {
    const prisma = this.prisma;
    const crypto = this.crypto;
    return {
      async getSecret() {
        const cred = await prisma.client.credential.findUnique({
          where: { userId_connector_label: { userId, connector: connectorId, label } },
        });
        if (!cred) return null;
        return crypto.decryptJson<Record<string, unknown>>(cred.dataEnc);
      },
    };
  }

  /** Store (or replace) a connector credential, encrypting the secret payload. */
  async saveCredential(
    userId: string,
    connectorId: string,
    secret: unknown,
    opts: { label?: string; meta?: Record<string, unknown> } = {},
  ): Promise<void> {
    const label = opts.label ?? 'default';
    const dataEnc = this.crypto.encryptJson(secret);
    const meta = (opts.meta ?? undefined) as Prisma.InputJsonValue | undefined;
    await this.prisma.client.credential.upsert({
      where: { userId_connector_label: { userId, connector: connectorId, label } },
      create: { userId, connector: connectorId, label, dataEnc, meta },
      update: { dataEnc, meta, status: 'active' },
    });
  }
}
