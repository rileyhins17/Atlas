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

  /**
   * Register a device for push.
   *
   * An endpoint belongs to a browser, not to an account, so re-subscribing on
   * one that already exists has to rebind it — two people sharing a laptop get
   * the same endpoint from the push service, and the second to sign in must not
   * be silently unsubscribable.
   *
   * What it must NOT do is what it used to: upsert keyed on `endpoint` alone,
   * whose update branch rewrote `userId` in place. That made this the only
   * write in the codebase capable of mutating another user's row — post someone
   * else's endpoint and their briefs arrive on your device while they quietly
   * stop receiving their own.
   *
   * So the rebind is a delete of whatever held the endpoint followed by a fresh
   * row owned by the caller, both inside one transaction: no foreign row is
   * edited, no window exists where the device is registered to nobody, and a
   * takeover leaves a log line rather than nothing.
   */
  async subscribe(userId: string, sub: PushSubscriptionInput): Promise<void> {
    const existing = await this.prisma.client.pushSubscription.findUnique({
      where: { endpoint: sub.endpoint },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      this.logger.warn(
        `Push endpoint reassigned from user ${existing.userId} to ${userId} (shared device, or an endpoint that leaked)`,
      );
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
      await tx.pushSubscription.create({
        data: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      });
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
