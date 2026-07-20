import { z } from 'zod';

/**
 * Validated environment. Fail fast at boot if anything required is missing or
 * malformed, so misconfiguration never turns into a confusing runtime error.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  // 32-byte key as 64 hex chars, used for AES-256-GCM credential encryption.
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  // Direct DeepSeek API model id (api.deepseek.com). Use a concrete id, not the
  // "deepseek-chat" alias — the alias resolves server-side (currently to
  // deepseek-v4-flash) and the resolved name is what lands in the ai_usage
  // ledger, so pricing lookups miss unless we ask for the real id up front.
  AI_MODEL: z.string().default('deepseek-v4-flash'),
  AI_DAILY_TOKEN_CAP: z.coerce.number().default(0),
  // Google Calendar OAuth client (app-level, not a user secret). Optional: when
  // unset the connector reports itself unconfigured instead of failing at boot,
  // so Atlas runs fine without Google.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/connectors/google/callback'),
  // Plaid (bank data aggregator). App-level credentials, not user secrets.
  // Optional: unset ⇒ the connector is unregistered and Settings shows
  // "unavailable", so Atlas runs fine without Plaid.
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  // Comma-separated ISO country codes Link should offer (Canadian banks need CA).
  PLAID_COUNTRY_CODES: z.string().default('US,CA'),
  PLAID_PRODUCTS: z.string().default('transactions'),
  // Registered only when using OAuth-based institutions; safe to leave unset in sandbox.
  PLAID_REDIRECT_URI: z.string().optional(),
  // Web Push (VAPID). Self-issued keypair, no external account. Optional: unset ⇒
  // push is unconfigured and the notification UI reports itself unavailable.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:atlas@example.com'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
