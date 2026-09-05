'use client';

import { useQuery } from '@tanstack/react-query';
import type { CreateTrackerInput, LogTrackerInput, UpdateTrackerInput } from '@atlas/shared';
import { TrackersApi } from '@/lib/api';
import { qk } from './keys';
import { useInvalidatingMutation } from './mutation';

export function useTrackers() {
  return useQuery({ queryKey: qk.trackers, queryFn: TrackersApi.list });
}

export function useTrackerOverview(days = 60) {
  return useQuery({
    queryKey: qk.trackerOverview(days),
    queryFn: () => TrackersApi.overview(days),
  });
}

/**
 * What the days you rate highest have in common.
 *
 * Prefixed under ['trackers'], so logging a rating invalidates it too — a new
 * rating is exactly the thing that can change the answer.
 */
export function useTrackerPatterns() {
  return useQuery({ queryKey: qk.trackerPatterns, queryFn: TrackersApi.patterns });
}

export function useCreateTracker() {
  return useInvalidatingMutation({
    mutationFn: (input: CreateTrackerInput) => TrackersApi.create(input),
    invalidates: qk.trackers,
  });
}

export function useUpdateTracker() {
  return useInvalidatingMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTrackerInput }) =>
      TrackersApi.update(id, patch),
    invalidates: qk.trackers,
  });
}

export function useArchiveTracker() {
  return useInvalidatingMutation({
    mutationFn: (id: string) => TrackersApi.archive(id),
    invalidates: qk.trackers,
  });
}

/**
 * Rate a day.
 *
 * `qk.trackers` is `['trackers']` and the overview key is
 * `['trackers','overview',n]`, and invalidation is prefix-matched — so this
 * takes the Progress sentence with it, which is the thing a new rating changes.
 */
export function useLogTracker() {
  return useInvalidatingMutation({
    mutationFn: ({ id, input }: { id: string; input: LogTrackerInput }) =>
      TrackersApi.log(id, input),
    invalidates: qk.trackers,
  });
}
