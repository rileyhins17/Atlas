import { createHash, createPublicKey, createVerify, timingSafeEqual, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { Connector, ConnectorContext } from './connector.js';

/**
 * Plaid item credentials for ONE linked bank. Stored AES-GCM encrypted in the
 * `credentials` table (keyed by `label = itemId` so a user can link several
 * banks). The connector never sees the DB or the key — only this payload, via
 * ConnectorContext.
 */
export const PlaidCredentialSchema = z.object({
  accessToken: z.string().min(1),
  itemId: z.string().min(1),
});
export type PlaidCredential = z.infer<typeof PlaidCredentialSchema>;

export type PlaidEnv = 'sandbox' | 'production';

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: PlaidEnv;
  /** Registered redirect URI, required only for OAuth-based institutions. */
  redirectUri?: string;
  /** e.g. ['US','CA']. */
  countryCodes: string[];
  /** e.g. ['transactions']. */
  products: string[];
}

/** A Plaid account as returned by /accounts/get, trimmed to what Atlas maps. */
export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string; // depository | credit | loan | investment | ...
  subtype?: string | null; // checking | savings | credit card | ...
  balances: {
    current?: number | null;
    available?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  };
}

/** A Plaid transaction from /transactions/sync, trimmed. */
export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number; // POSITIVE = money out of the account (Plaid's convention)
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  name: string;
  merchant_name?: string | null;
  category?: string[] | null;
  date: string; // YYYY-MM-DD (posted/authorized date)
  pending: boolean;
}

export interface TransactionsSyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: string[]; // transaction_ids
  nextCursor: string;
}

const BASE_URL: Record<PlaidEnv, string> = {
  sandbox: 'https://sandbox.plaid.com',
  production: 'https://production.plaid.com',
};

/** Default sandbox institution for end-to-end verification (Plaid's "First Platypus Bank"). */
const SANDBOX_INSTITUTION = 'ins_109508';
/** /transactions/sync has a hard page cap of 500. */
const SYNC_PAGE_SIZE = 500;
/** Guard against a runaway pagination loop. */
const MAX_SYNC_PAGES = 50;

/** Plaid's signed webhook token is intentionally verified without an SDK. */
type PlaidWebhookKey = {
  alg: 'ES256';
  crv: 'P-256';
  kid: string;
  kty: 'EC';
  use?: 'sig';
  x: string;
  y: string;
  expired_at?: number | null;
};

type PlaidWebhookClaims = {
  iat?: unknown;
  request_body_sha256?: unknown;
};

const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const WEBHOOK_CLOCK_SKEW_SECONDS = 60;

/** Error carrying Plaid's machine-readable error_code so callers can branch. */
export class PlaidApiError extends Error {
  constructor(
    message: string,
    readonly errorCode: string | undefined,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlaidApiError';
  }
}

/**
 * Convert a Plaid amount to Atlas's signed minor units.
 *
 * Plaid: amount is POSITIVE when money LEAVES the account (a debit/purchase),
 * negative for money in. Atlas Transaction.amountMinor is the opposite —
 * **negative = money out**. So we invert the sign. Getting this backwards makes
 * every expense look like income; it is unit-tested both directions.
 */
export function plaidAmountToMinor(amount: number): number {
  return Math.round(-amount * 100);
}

/** Map Plaid's type/subtype onto Atlas's coarse account type. */
export function mapPlaidAccountType(type: string, subtype?: string | null): string {
  const t = type.toLowerCase();
  const s = (subtype ?? '').toLowerCase();
  if (t === 'credit') return 'credit';
  if (t === 'investment' || t === 'brokerage') return 'investment';
  if (t === 'loan') return 'credit';
  if (t === 'depository') {
    if (s === 'savings') return 'savings';
    if (s === 'checking') return 'checking';
    return 'checking';
  }
  return 'cash';
}

/** The currency for an account/transaction, defaulting sensibly. */
export function plaidCurrency(
  slot: { iso_currency_code?: string | null; unofficial_currency_code?: string | null },
): string {
  return slot.iso_currency_code ?? slot.unofficial_currency_code ?? 'USD';
}

/**
 * Plaid connector: Link + accounts + transactions/sync over the plain JSON REST
 * API (no `plaid` SDK — same raw-fetch approach as GoogleCalendarConnector).
 *
 * Read-only against the bank: Atlas pulls, never pushes. Reconciling the pulled
 * data against Atlas's tables is the owning module's job (PlaidSyncService),
 * because a connector has no DB access by design.
 */
export class PlaidConnector implements Connector {
  readonly id = 'plaid';
  readonly label = 'Bank accounts (Plaid)';
  readonly credentialSchema = PlaidCredentialSchema;
  readonly capabilities = ['finance.read'] as const;

  private readonly webhookKeys = new Map<string, { key: KeyObject; expiredAt: number | null }>();

  constructor(private readonly config: PlaidConfig) {}

  private get baseUrl(): string {
    return BASE_URL[this.config.env];
  }

  /** POST a JSON body with the app credentials injected; throw a typed error on failure. */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        secret: this.config.secret,
        ...body,
      }),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as
        | { error_code?: string; error_message?: string }
        | null;
      const code = detail?.error_code;
      const msg = detail?.error_message ?? `Plaid ${path} failed (${res.status})`;
      throw new PlaidApiError(msg, code, res.status);
    }
    return (await res.json()) as T;
  }

  /**
   * Verify Plaid's `Plaid-Verification` JWT against the exact raw request body.
   *
   * Plaid signs with ES256 and publishes a JWK per key id. The JWT signature is
   * verified before its claims are trusted, then `iat` prevents replay and the
   * body hash proves the parsed request is the signed request. This stays here
   * rather than in the API module so the app credentials never leave the
   * connector boundary and no second JWT dependency is needed at runtime.
   */
  async verifyWebhook(rawBody: Buffer | string, token: string): Promise<boolean> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const [encodedHeader, encodedClaims, encodedSignature] = parts;
      if (!encodedHeader || !encodedClaims || !encodedSignature) return false;

      const header = decodeJson<{ alg?: unknown; kid?: unknown }>(encodedHeader);
      if (header?.alg !== 'ES256' || typeof header.kid !== 'string' || !isSafeKeyId(header.kid)) {
        return false;
      }

      const keyRecord = await this.webhookKey(header.kid);
      if (!keyRecord) return false;

      const verifier = createVerify('sha256');
      verifier.update(`${encodedHeader}.${encodedClaims}`);
      verifier.end();
      const signature = decodeBase64Url(encodedSignature);
      if (!signature) return false;
      // JWT ECDSA signatures are the IEEE-P1363 r||s form, not OpenSSL DER.
      if (!verifier.verify({ key: keyRecord.key, dsaEncoding: 'ieee-p1363' }, signature)) {
        return false;
      }

      const claims = decodeJson<PlaidWebhookClaims>(encodedClaims);
      const iat = claims?.iat;
      const claimedHash = claims?.request_body_sha256;
      const now = Math.floor(Date.now() / 1000);
      if (
        typeof iat !== 'number' ||
        !Number.isInteger(iat) ||
        iat < now - WEBHOOK_MAX_AGE_SECONDS ||
        iat > now + WEBHOOK_CLOCK_SKEW_SECONDS ||
        typeof claimedHash !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(claimedHash)
      ) {
        return false;
      }

      const actualHash = createHash('sha256').update(rawBody).digest('hex');
      return timingSafeEqual(
        Buffer.from(actualHash, 'ascii'),
        Buffer.from(claimedHash.toLowerCase(), 'ascii'),
      );
    } catch {
      // A malformed token, unavailable verification endpoint, or invalid JWK
      // is an unverified webhook — never turn it into a successful response.
      return false;
    }
  }

  private async webhookKey(kid: string): Promise<{ key: KeyObject; expiredAt: number | null } | null> {
    const cached = this.webhookKeys.get(kid);
    const now = Math.floor(Date.now() / 1000);
    if (cached && (cached.expiredAt === null || cached.expiredAt > now)) return cached;

    const data = await this.post<{ key: PlaidWebhookKey }>('/webhook_verification_key/get', {
      key_id: kid,
    });
    const key = data.key;
    if (
      !key ||
      key.alg !== 'ES256' ||
      key.crv !== 'P-256' ||
      key.kty !== 'EC' ||
      key.kid !== kid ||
      typeof key.x !== 'string' ||
      typeof key.y !== 'string'
    ) {
      return null;
    }
    const record = {
      key: createPublicKey({
        key: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y },
        format: 'jwk',
      }),
      expiredAt: key.expired_at ?? null,
    };
    if (record.expiredAt !== null && record.expiredAt <= now) return null;
    this.webhookKeys.set(kid, record);
    return record;
  }

  private async secret(ctx: ConnectorContext): Promise<PlaidCredential> {
    const parsed = PlaidCredentialSchema.safeParse(await ctx.getSecret());
    if (!parsed.success) {
      throw new Error('This bank is not connected. Reconnect it in Settings.');
    }
    return parsed.data;
  }

  /**
   * Create a Link token to hand the browser's Plaid Link widget. Passing an
   * existing access token puts Link into "update mode" (re-auth an item), which
   * must NOT include `products` per Plaid's API.
   */
  async createLinkToken(opts: { userId: string; accessToken?: string }): Promise<string> {
    const body: Record<string, unknown> = {
      user: { client_user_id: opts.userId },
      client_name: 'Atlas',
      language: 'en',
      country_codes: this.config.countryCodes,
    };
    if (opts.accessToken) {
      body.access_token = opts.accessToken; // update mode
    } else {
      body.products = this.config.products;
    }
    if (this.config.redirectUri) body.redirect_uri = this.config.redirectUri;
    const data = await this.post<{ link_token: string }>('/link/token/create', body);
    return data.link_token;
  }

  /** Exchange the Link public_token for a durable item access token. */
  async exchangePublicToken(publicToken: string): Promise<PlaidCredential> {
    const data = await this.post<{ access_token: string; item_id: string }>(
      '/item/public_token/exchange',
      { public_token: publicToken },
    );
    return { accessToken: data.access_token, itemId: data.item_id };
  }

  /** Accounts + balances for a linked item, plus its institution id (for naming). */
  async getAccounts(
    ctx: ConnectorContext,
  ): Promise<{ accounts: PlaidAccount[]; itemId: string; institutionId: string | null }> {
    const cred = await this.secret(ctx);
    const data = await this.post<{
      accounts: PlaidAccount[];
      item: { item_id: string; institution_id?: string | null };
    }>('/accounts/get', { access_token: cred.accessToken });
    return {
      accounts: data.accounts,
      itemId: data.item.item_id,
      institutionId: data.item.institution_id ?? null,
    };
  }

  /** Human-readable institution name (best-effort; app-level call, no item secret). */
  async getInstitutionName(institutionId: string): Promise<string | null> {
    try {
      const data = await this.post<{ institution: { name: string } }>(
        '/institutions/get_by_id',
        { institution_id: institutionId, country_codes: this.config.countryCodes },
      );
      return data.institution.name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Incremental transaction sync. Walks every page (has_more) and returns the
   * final cursor to persist. On a freshly linked item Plaid may answer
   * PRODUCT_NOT_READY — that surfaces as a PlaidApiError the caller skips and
   * retries on the next sync.
   */
  async syncTransactions(ctx: ConnectorContext, cursor?: string): Promise<TransactionsSyncResult> {
    const cred = await this.secret(ctx);
    const out: TransactionsSyncResult = { added: [], modified: [], removed: [], nextCursor: cursor ?? '' };
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < MAX_SYNC_PAGES) {
      const body: Record<string, unknown> = {
        access_token: cred.accessToken,
        count: SYNC_PAGE_SIZE,
      };
      if (out.nextCursor) body.cursor = out.nextCursor;
      const data = await this.post<{
        added: PlaidTransaction[];
        modified: PlaidTransaction[];
        removed: { transaction_id: string }[];
        next_cursor: string;
        has_more: boolean;
      }>('/transactions/sync', body);
      out.added.push(...data.added);
      out.modified.push(...data.modified);
      out.removed.push(...data.removed.map((r) => r.transaction_id));
      out.nextCursor = data.next_cursor;
      hasMore = data.has_more;
      pages++;
    }
    return out;
  }

  /** Stop syncing an item and invalidate its access token at Plaid. */
  async removeItem(ctx: ConnectorContext): Promise<void> {
    const cred = await this.secret(ctx);
    await this.post('/item/remove', { access_token: cred.accessToken });
  }

  /**
   * SANDBOX ONLY: mint a public_token without any human, so the whole
   * exchange→sync path can be verified end-to-end in tests/CI.
   */
  async sandboxCreatePublicToken(institutionId = SANDBOX_INSTITUTION): Promise<string> {
    if (this.config.env !== 'sandbox') {
      throw new Error('sandboxCreatePublicToken is only available in the Plaid sandbox.');
    }
    const data = await this.post<{ public_token: string }>('/sandbox/public_token/create', {
      institution_id: institutionId,
      initial_products: ['transactions'],
    });
    return data.public_token;
  }

  async verify(ctx: ConnectorContext): Promise<boolean> {
    try {
      await this.getAccounts(ctx);
      return true;
    } catch {
      return false;
    }
  }
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return null;
  }
}

function decodeJson<T>(value: string): T | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString('utf8')) as T;
  } catch {
    return null;
  }
}

function isSafeKeyId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}
