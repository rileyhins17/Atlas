import { z } from 'zod';

/** User preferences that drive the proactive engine (+ how Atlas addresses you). */
export const SettingsDTO = z.object({
  displayName: z.string().nullable(),
  timezone: z.string(),
  briefHour: z.number().int(),
  proactiveEnabled: z.boolean(),
});
export type SettingsDTO = z.infer<typeof SettingsDTO>;

export const UpdateSettingsInput = z.object({
  displayName: z.string().min(1).max(80).optional(),
  // IANA timezone name (e.g. "America/Toronto"). Validated for parseability
  // server-side; kept loose here so the client can send whatever Intl reports.
  timezone: z.string().min(1).max(64).optional(),
  // Local hour (0-23) at which to fire the daily brief / weekly review.
  briefHour: z.number().int().min(0).max(23).optional(),
  proactiveEnabled: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;
