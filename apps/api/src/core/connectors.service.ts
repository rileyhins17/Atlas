import { Injectable } from '@nestjs/common';
import {
  ConnectorRegistry,
  DeepSeekConnector,
  GoogleCalendarConnector,
  GoogleHealthConnector,
  PlaidConnector,
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
  /** Same Google client as Calendar, its own grant. Null without Google config. */
  readonly googleHealth: GoogleHealthConnector | null;
  /** Null when PLAID_CLIENT_ID/SECRET aren't configured — Atlas runs fine without Plaid. */
  readonly plaid: PlaidConnector | null;

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

    const healthRedirect = googleHealthRedirectUri(env);
    this.googleHealth =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && healthRedirect
        ? new GoogleHealthConnector({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: healthRedirect,
          })
        : null;
    if (this.googleHealth) this.registry.register(this.googleHealth);

    this.plaid =
      env.PLAID_CLIENT_ID && env.PLAID_SECRET
        ? new PlaidConnector({
            clientId: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,
            env: env.PLAID_ENV,
            redirectUri: env.PLAID_REDIRECT_URI,
            countryCodes: env.PLAID_COUNTRY_CODES.split(',').map((c) => c.trim()).filter(Boolean),
            products: env.PLAID_PRODUCTS.split(',').map((p) => p.trim()).filter(Boolean),
          })
        : null;
    if (this.plaid) this.registry.register(this.plaid);
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

/**
 * Where Google sends the browser back after Health consent.
 *
 * Explicit wins. Otherwise it is the Calendar callback with its last path
 * segment swapped, so a deployment that already works for Calendar needs no
 * new env var — only the derived URL registered in Google Cloud, which
 * Settings shows verbatim.
 */
export function googleHealthRedirectUri(env: {
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_HEALTH_REDIRECT_URI?: string;
}): string | null {
  if (env.GOOGLE_HEALTH_REDIRECT_URI) return env.GOOGLE_HEALTH_REDIRECT_URI;
  const derived = env.GOOGLE_REDIRECT_URI.replace(
    /\/connectors\/google\/callback$/,
    '/connectors/google-health/callback',
  );
  // Unchanged means the Calendar callback has some other shape. Reusing it
  // would send Health consent to the CALENDAR callback and store the grant
  // there, so Health reports itself unconfigured instead.
  return derived === env.GOOGLE_REDIRECT_URI ? null : derived;
}

