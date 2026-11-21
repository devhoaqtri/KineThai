/**
 * Route/loader prefetch helpers for this feature.
 *
 * Exports: prefetchFeed, prefetchPost
 * Depends on: @tanstack/react-query, @/features/session, @/features/demo, @/shared/types
 */

import type { QueryClient } from "@tanstack/react-query";
import { resolveDataMode } from "@/features/session/data-mode";
import type { SocialFeedData, SocialPostData } from "@/shared/types";
import { feedQueryOptions, postQueryOptions } from "./queries";
import { getFeed, getPost } from "./social.functions";

/**
 * Prefetch the feed into the QueryClient for route loaders.
 * @param queryClient - queryClient argument
 * @returns Resolved feed data (cached under socialKeys.feed)
 */
export async function prefetchFeed(queryClient: QueryClient): Promise<SocialFeedData> {
  const mode = resolveDataMode();
  return queryClient.ensureQueryData(
    feedQueryOptions(mode, () =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockFeed()) : (getFeed() as Promise<SocialFeedData>),
    ),
  );
}

/**
 * Prefetch a single post into the QueryClient for route loaders.
 * @param queryClient - queryClient argument
 * @param postId - postId argument
 * @returns Resolved post graph
 */
export async function prefetchPost(
  queryClient: QueryClient,
  postId: string,
): Promise<SocialPostData> {
  const mode = resolveDataMode();
  return queryClient.ensureQueryData(
    postQueryOptions(mode, postId, () =>
      mode === "demo"
        ? import("@/features/demo").then((demo) => demo.getMockPost(postId))
        : (getPost({ data: { post_id: postId } }) as Promise<SocialPostData>),
    ),
  );
}
