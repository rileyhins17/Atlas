import type { ZodType } from 'zod';

/**
 * A Connector is Atlas's plug for one external API (Google Calendar, a bank feed,
 * DeepSeek, weather, ...). Every integration implements this interface and is
 * registered in the ConnectorRegistry. Adding an integration = adding a
 * connector; nothing in the core changes.
 *
 * Secrets are never held by the connector. The host passes a `ConnectorContext`
 * whose `getSecret()` returns the decrypted credential payload on demand.
 */
export interface ConnectorContext {
  /** Returns the decrypted secret payload for this connector, or null if unset. */
  getSecret(): Promise<Record<string, unknown> | null>;
  /**
   * Replace the stored secret — for OAuth connectors, whose access tokens expire
   * and must be refreshed mid-flight. The connector still never sees the DB or
   * the encryption key; it hands back a payload and the host encrypts it.
   */
  saveSecret(secret: Record<string, unknown>): Promise<void>;
}

/**
 * Outcome of a two-way sync. Reconciling against Atlas's tables is deliberately
 * NOT the connector's job — a connector has no DB access by design — so the
 * owning module's service performs the sync and reports this.
 */
export interface SyncResult {
  connector: string;
  imported: number;
  updated: number;
  pushed: number;
  deleted: number;
  errors: string[];
}

export interface Connector {
  /** Stable id, e.g. "deepseek", "google-calendar". */
  readonly id: string;
  /** Human label for the Settings UI. */
  readonly label: string;
  /** Zod schema describing the secret payload this connector stores. */
  readonly credentialSchema: ZodType;
  /** Coarse capability tags, e.g. ["ai.chat"], ["calendar.read","calendar.write"]. */
  readonly capabilities: readonly string[];

  /** Verify the stored credential works. Returns true if healthy. */
  verify(ctx: ConnectorContext): Promise<boolean>;
}

/** Simple in-memory registry. Modules/connectors register themselves at boot. */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    if (this.connectors.has(connector.id)) {
      throw new Error(`Connector already registered: ${connector.id}`);
    }
    this.connectors.set(connector.id, connector);
  }

  get(id: string): Connector | undefined {
    return this.connectors.get(id);
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }
}

/**
 * The user has not connected this integration (no credential, or one that no
 * longer parses). Distinct from a transport failure: nothing is broken, the
 * account simply is not set up, and the fix is a user action rather than a
 * retry.
 *
 * The API maps this to 424 Failed Dependency in AllExceptionsFilter. Without
 * it every AI route returned a bare 500 to anyone who had not yet added a key
 * — which is the state of every new account.
 */
export class ConnectorNotConfiguredError extends Error {
  readonly connectorId: string;

  constructor(connectorId: string, message: string) {
    super(message);
    this.name = 'ConnectorNotConfiguredError';
    this.connectorId = connectorId;
  }
}
