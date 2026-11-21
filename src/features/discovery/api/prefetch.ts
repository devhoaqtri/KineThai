/**
 * Route/loader prefetch helpers for this feature.
 *
 * Exports: prefetchDiscover, prefetchMe, prefetchProfile
 * Depends on: @tanstack/react-query, @/features/session, @/features/demo, @/shared/types, @/features/social
 */

import type { QueryClient } from "@tanstack/react-query";
import { resolveDataMode } from "@/features/session/data-mode";
import type { SocialDiscoverData, SocialMeData, SocialProfileData } from "@/shared/types";
import { discoverQueryOptions, meQueryOptions, profileQueryOptions } from "./queries";
import { getDiscover, getMe } from "./discovery.functions";
import { getProfile } from "@/features/social/api/social.functions";

/**
 * Prefetch discover grid data for route loaders.
 * @param queryClient - queryClient argument
 * @returns Promise that resolves when prefetch completes
 */
export async function prefetchDiscover(queryClient: QueryClient): Promise<SocialDiscoverData> {
  const mode = resolveDataMode();
  return queryClient.ensureQueryData(
    discoverQueryOptions(mode, () =>
      mode === "demo"
        ? import("@/features/demo").then((demo) => demo.getMockDiscover())
        : (getDiscover() as Promise<SocialDiscoverData>),
    ),
  );
}

/**
 * Prefetch signed-in me payload for route loaders.
 * @param queryClient - queryClient argument
 * @returns Promise that resolves when prefetch completes
 */
export async function prefetchMe(queryClient: QueryClient): Promise<SocialMeData> {
  const mode = resolveDataMode();
  return queryClient.ensureQueryData(
    meQueryOptions(mode, () =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockMe()) : (getMe() as Promise<SocialMeData>),
    ),
  );
}

/**
 * Prefetch a public profile (+ me) for the profile route loader.
 * @param queryClient - queryClient argument
 * @param username - username argument
 * @returns Promise that resolves when prefetch completes
 */
export async function prefetchProfile(queryClient: QueryClient, username: string): Promise<void> {
  const mode = resolveDataMode();
  await Promise.all([
    queryClient.ensureQueryData(
      profileQueryOptions(username, mode, () =>
        mode === "demo"
          ? import("@/features/demo").then((demo) => demo.getMockProfile(username))
          : (getProfile({ data: { username } }) as Promise<SocialProfileData>),
      ),
    ),
    prefetchMe(queryClient),
  ]);
}
