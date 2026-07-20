import { z } from 'zod';

/** A browser PushManager subscription, as the Push API produces it. */
export const PushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const PushUnsubscribeInput = z.object({
  endpoint: z.string().min(1),
});
export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeInput>;
