import { Injectable } from '@nestjs/common';
import {
  ConnectorRegistry,
  DeepSeekConnector,
  GoogleCalendarConnector,
  type Connector,
  type ConnectorContext,
} from '@atlas/connectors';
import type { Prisma } from '@atlas/db';
import { PrismaService } from './prisma.service.js';
import { CryptoService } from './crypto.service.js';
import { loadEnv } from '../config/env.js';

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
  readonly deepseek = new DeepSeekConnector();
  /** Null when GOOGLE_CLIENT_ID/SECRET aren't configured — Atlas runs fine without Google. */
  readonly googleCalendar: GoogleCalendarConnector | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    this.registry.register(this.deepseek);

    const env = loadEnv();
    this.googleCalendar =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? new GoogleCalendarConnector({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: env.GOOGLE_REDIRECT_URI,
          })
        : null;
    if (this.googleCalendar) this.registry.register(this.googleCalendar);
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
      saveSecret: async (secret) => {
        await this.saveCredential(userId, connectorId, secret, { label });
      },
    };
  }

  /**
   * Update a credential's non-secret metadata (sync cursors, account labels)
   * without touching the encrypted payload. No-op if the credential is gone.
   */
  async saveCredentialMeta(
    userId: string,
    connectorId: string,
    meta: Record<string, unknown>,
    label = 'default',
  ): Promise<void> {
    const where = { userId_connector_label: { userId, connector: connectorId, label } };
    const existing = await this.prisma.client.credential.findUnique({ where });
    if (!existing) return;
    const merged = { ...((existing.meta as Record<string, unknown> | null) ?? {}), ...meta };
    await this.prisma.client.credential.update({
      where,
      data: { meta: merged as Prisma.InputJsonValue },
    });
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
