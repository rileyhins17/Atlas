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
  // Direct DeepSeek API model id (api.deepseek.com), e.g. "deepseek-chat".
  AI_MODEL: z.string().default('deepseek-chat'),
  AI_DAILY_TOKEN_CAP: z.coerce.number().default(0),
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
