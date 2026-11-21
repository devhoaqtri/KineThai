/**
 * Social TanStack Query option factories (feed + post).
 *
 * Exports: feedQueryOptions, postQueryOptions, FeedQueryOptions, PostQueryOptions
 * Depends on: shared/api-client, features/demo mocks, socialKeys
 */

import { queryOptions } from "@tanstack/react-query";
import type { DataMode } from "@/features/session/data-mode";
import { runDataMode } from "@/shared/api-client";
import type { SocialFeedData, SocialPostData } from "@/shared/types";
import { socialKeys } from "./keys";

/**
 * Build TanStack Query options for the authenticated feed.
 * @param mode - demo or live query-key segment
 * @param fetchLive - live serverFn caller from the route/hook
 * @returns queryOptions with historical key/staleTime behavior
 */
export function feedQueryOptions(
  mode: DataMode,
  fetchLive: () => Promise<SocialFeedData>,
): ReturnType<typeof buildFeedQueryOptions> {
  return buildFeedQueryOptions(mode, fetchLive);
}

function buildFeedQueryOptions(mode: DataMode, fetchLive: () => Promise<SocialFeedData>) {
  return queryOptions({
    queryKey: socialKeys.feed(mode),
    queryFn: (): Promise<SocialFeedData> =>
      runDataMode({ demo: () => import("@/features/demo").then((demo) => demo.getMockFeed()), live: fetchLive }, mode),
    staleTime: 30_000,
  });
}

/** Inferred TanStack options shape for the feed query. */
export type FeedQueryOptions = ReturnType<typeof buildFeedQueryOptions>;

/**
 * Build TanStack Query options for a single post permalink.
 * @param mode - demo or live query-key segment
 * @param postId - post UUID
 * @param fetchLive - live serverFn caller from the route/hook
 * @returns queryOptions matching historical post key behavior
 */
export function postQueryOptions(
  mode: DataMode,
  postId: string,
  fetchLive: () => Promise<SocialPostData>,
): ReturnType<typeof buildPostQueryOptions> {
  return buildPostQueryOptions(mode, postId, fetchLive);
}

function buildPostQueryOptions(
  mode: DataMode,
  postId: string,
  fetchLive: () => Promise<SocialPostData>,
) {
  return queryOptions({
    queryKey: socialKeys.post(mode, postId),
    queryFn: (): Promise<SocialPostData> =>
      runDataMode({ demo: () => import("@/features/demo").then((demo) => demo.getMockPost(postId)), live: fetchLive }, mode),
    staleTime: 30_000,
    retry: false,
  });
}

/** Inferred TanStack options shape for the post query. */
export type PostQueryOptions = ReturnType<typeof buildPostQueryOptions>;
