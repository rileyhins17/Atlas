import { z } from 'zod';

/**
 * The push services a browser can actually hand back an endpoint for.
 *
 * `z.string().url()` accepted `https://attacker.example/collect`, so the server
 * would happily store — and later POST notification payloads to — any absolute
 * URL a client named. Allow-listed rather than pattern-matched because the set
 * is small, stable, and owned by the three browser vendors.
 */
const PUSH_SERVICE_HOSTS = [
  'android.googleapis.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.stage.mozaws.net',
  'notify.windows.com',
  'wns2-.notify.windows.com',
  'web.push.apple.com',
];

function isPushServiceEndpoint(raw: string): boolean {
  // Parsed by hand rather than with `URL`: this package is browser-safe and
  // compiles without the DOM lib, so the global is not in scope here.
  //
  // https only. The endpoint receives the notification payload, and http would
  // put the contents of someone's daily brief on the wire in clear.
  const prefix = 'https://';
  if (!raw.startsWith(prefix)) return false;
  const afterScheme = raw.slice(prefix.length);
  const end = afterScheme.search(/[/?#]/);
  const authority = end === -1 ? afterScheme : afterScheme.slice(0, end);
  // Credentials or a port would let `user@evil.example` masquerade as a host.
  if (authority.includes('@')) return false;
  const host = (authority.split(':')[0] ?? '').toLowerCase();
  if (!host) return false;
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** A browser PushManager subscription, as the Push API produces it. */
export const PushSubscriptionInput = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine(isPushServiceEndpoint, 'Not a recognised push service endpoint'),
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
