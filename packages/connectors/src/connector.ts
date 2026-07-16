import type { ZodType } from 'zod';

/**
 * A Connector is Atlas's plug for one external API (Google Calendar, a bank feed,
 * OpenRouter, weather, ...). Every integration implements this interface and is
 * registered in the ConnectorRegistry. Adding an integration = adding a
 * connector; nothing in the core changes.
 *
 * Secrets are never held by the connector. The host passes a `ConnectorContext`
 * whose `getSecret()` returns the decrypted credential payload on demand.
 */
export interface ConnectorContext {
  /** Returns the decrypted secret payload for this connector, or null if unset. */
  getSecret(): Promise<Record<string, unknown> | null>;
}

export interface SyncResult {
  connector: string;
  imported: number;
  updated: number;
  errors: string[];
}

export interface Connector {
  /** Stable id, e.g. "openrouter", "google-calendar". */
  readonly id: string;
  /** Human label for the Settings UI. */
  readonly label: string;
  /** Zod schema describing the secret payload this connector stores. */
  readonly credentialSchema: ZodType;
  /** Coarse capability tags, e.g. ["ai.chat"], ["calendar.read","calendar.write"]. */
  readonly capabilities: readonly string[];

  /** Verify the stored credential works. Returns true if healthy. */
  verify(ctx: ConnectorContext): Promise<boolean>;

  /** Optional: pull data from the external source into Atlas. */
  sync?(ctx: ConnectorContext): Promise<SyncResult>;
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
