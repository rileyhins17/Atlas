import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { PushSubscriptionInput } from '@atlas/shared';
import { PrismaService } from '../../core/prisma.service.js';
import { loadEnv } from '../../config/env.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Web Push delivery. VAPID keys are self-issued (no external account), set once
 * at boot. Sending is best-effort: a subscription that returns 404/410 is stale
 * (browser unsubscribed / expired) and gets pruned so it isn't retried forever.
 *
 * Unconfigured (no VAPID keys) ⇒ every method is a safe no-op and the UI shows
 * notifications as unavailable — Atlas runs fine without push.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;
  private readonly vapidPublicKey: string | null;

  constructor(private readonly prisma: PrismaService) {
    const env = loadEnv();
    this.vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;
    this.configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.configured) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  publicKey(): string | null {
    return this.vapidPublicKey;
  }

  async subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
    await this.prisma.client.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      // Re-subscribing on the same endpoint (possibly as a different user) rebinds it.
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.client.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Push to all of a user's devices. Returns how many were delivered. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) return 0;
    const subs = await this.prisma.client.pushSubscription.findMany({ where: { userId } });
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.client.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            this.logger.warn(
              `Push to subscription ${s.id} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
            );
          }
        }
      }),
    );
    return sent;
  }
}
