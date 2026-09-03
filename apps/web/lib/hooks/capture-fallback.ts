'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { describeLocalCapture, parseCapture } from '@atlas/shared';
import { ApiError, EventsApi, TasksApi } from '@/lib/api';

/**
 * Capture, when there is no AI to route it through.
 *
 * A new account has no DeepSeek key, so every capture used to answer with an
 * error — at exactly the moment the product is meant to prove it works. The one
 * interaction Atlas asks everyone to learn cannot be the one that fails on day
 * one.
 *
 * So a 424 (the integration is not usable) stops being a dead end: the sentence
 * is parsed locally and really written. What the user typed lands somewhere
 * either way, which is the whole promise of a capture box.
 */
export function useCaptureFallback() {
  const qc = useQueryClient();

  /** Returns what to tell the user, or null if this error is not ours to handle. */
  return useCallback(
    async (text: string, err: unknown): Promise<string | null> => {
      // 424 is the API's "this integration cannot be used" — no key, or an
      // expired one. Anything else is a real failure and must stay visible.
      if (!(err instanceof ApiError) || err.status !== 424) return null;

      // The dock appends its tapped time window as a trailing "(this evening)"
      // for the model to read. The local parser has no idea what that is, so it
      // would end up in the title of the row the user actually gets.
      const parsed = parseCapture(text.replace(/\s*\([^()]*\)\s*$/, '').trim() || text, new Date());
      if (parsed.kind === 'event' && parsed.at && parsed.endAt) {
        await EventsApi.create({
          title: parsed.title,
          startAt: parsed.at.toISOString(),
          endAt: parsed.endAt.toISOString(),
        });
      } else {
        await TasksApi.create({
          title: parsed.title,
          ...(parsed.at ? { dueAt: parsed.at } : {}),
        });
      }

      // Capture can write to any domain, so nothing cached is known to be current.
      void qc.invalidateQueries();
      return describeLocalCapture(parsed);
    },
    [qc],
  );
}
