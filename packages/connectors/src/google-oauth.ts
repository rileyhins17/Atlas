import { z } from 'zod';
import {
  ConnectorAuthExpiredError,
  ConnectorNotConfiguredError,
  type ConnectorContext,
} from './connector.js';

/**
 * OAuth tokens for one Google account. Stored AES-GCM encrypted in the
 * `credentials` table — never on disk, never in env (the *client* id/secret are
 * app-level config and do live in env; these are the user's tokens).
 */
export const GoogleCredentialSchema = z.object({
  accessToken: z.string().min(1),
  /**
   * Google only returns a refresh token on the FIRST consent unless
   * prompt=consent is forced. Optional here so a re-consent that omits it
   * doesn't fail validation and wipe the one we already hold.
   */
  refreshToken: z.string().optional(),
  /** Epoch ms when accessToken expires. */
  expiresAt: z.number(),
  scope: z.string().optional(),
});
export type GoogleCredential = z.infer<typeof GoogleCredentialSchema>;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Refresh a bit early so a token can't expire mid-request. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * The Google OAuth handshake and token lifecycle, shared by every Google
 * connector (Calendar, Health).
 *
 * One Google Cloud client serves both, but each connector keeps its OWN grant
 * with its own scopes, stored under its own connector id: connecting your
 * watch must never be able to break your calendar sync, and disconnecting one
 * must not revoke the other.
 */
export class GoogleOAuth {
  constructor(
    private readonly config: GoogleOAuthConfig,
    /** Which connector's grant this is — used in every user-facing error. */
    private readonly connectorId: string,
    /** "Google Calendar", "Google Health" — what the user knows it as. */
    private readonly label: string,
    private readonly scope: string,
  ) {}

  get redirectUri(): string {
    return this.config.redirectUri;
  }

  /**
   * URL to send the user to for consent. `state` is caller-supplied and MUST be
   * verified on callback — it's the CSRF defence for the OAuth handshake.
   *
   * access_type=offline + prompt=consent are what make Google return a refresh
   * token; without them a re-consent yields access-only tokens and sync dies an
   * hour later.
   */
  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.scope,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Exchange the one-time callback code for tokens. */
  async exchangeCode(code: string): Promise<GoogleCredential> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope,
    };
  }

  /**
   * A valid access token, refreshing and re-persisting if it's expired/expiring.
   * Google omits refresh_token from refresh responses, so the existing one is
   * carried forward — dropping it would silently break the next refresh.
   */
  async accessToken(ctx: ConnectorContext): Promise<string> {
    const parsed = GoogleCredentialSchema.safeParse(await ctx.getSecret());
    if (!parsed.success) {
      throw new ConnectorNotConfiguredError(
        this.connectorId,
        `${this.label} is not connected. Connect it in Settings.`,
      );
    }
    const cred = parsed.data;
    if (cred.expiresAt - EXPIRY_SKEW_MS > Date.now()) return cred.accessToken;

    if (!cred.refreshToken) {
      throw new ConnectorAuthExpiredError(
        this.connectorId,
        `Your ${this.label} sign-in has expired. Reconnect it to sync again.`,
      );
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: cred.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // `invalid_grant` means the refresh token itself is dead — revoked by the
      // user, or expired by Google (which it does after seven days while the
      // OAuth consent screen is still in "Testing"). That is the user's to fix
      // by reconnecting, so it must not be reported as a server fault.
      if (res.status === 400 && text.includes('invalid_grant')) {
        throw new ConnectorAuthExpiredError(
          this.connectorId,
          `Your ${this.label} sign-in has expired or been revoked. Reconnect it to sync again.`,
        );
      }
      throw new Error(`Google token refresh failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number; scope?: string };
    const refreshed: GoogleCredential = {
      accessToken: data.access_token,
      refreshToken: cred.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope ?? cred.scope,
    };
    await ctx.saveSecret(refreshed);
    return refreshed.accessToken;
  }
}
