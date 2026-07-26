import { z } from 'zod';

/**
 * 320 is the RFC 5321 ceiling (64-char local part + @ + 255-char domain), and
 * 200 is far past any real passphrase.
 *
 * Both were previously unbounded, so the 1MB body limit was the only ceiling:
 * a 100KB email was accepted and stored, and scrypt would derive a key over a
 * megabyte of input. Cheap to send, not cheap to hash.
 */
const email = z.string().email().max(320);
const password = z.string().max(200);

export const RegisterInput = z.object({
  email,
  password: password.min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(80).optional(),
  timezone: z.string().default('UTC'),
  /** Required only when the deployment sets INVITE_CODE. */
  inviteCode: z.string().max(200).optional(),
  /**
   * Keep the session across browser restarts. Defaults to TRUE: this is a
   * personal daily-use app, and being logged out every time you close the tab
   * is the single most annoying thing a tool like this can do. The checkbox is
   * there to opt out on a shared machine.
   */
  remember: z.boolean().default(true),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/** Public, unauthenticated: lets the sign-up form know whether to ask for a code. */
export const AuthConfigDTO = z.object({
  inviteRequired: z.boolean(),
});
export type AuthConfigDTO = z.infer<typeof AuthConfigDTO>;

export const LoginInput = z.object({
  email,
  password: password.min(1),
  remember: z.boolean().default(true),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  timezone: z.string(),
});
export type UserDTO = z.infer<typeof UserDTO>;
