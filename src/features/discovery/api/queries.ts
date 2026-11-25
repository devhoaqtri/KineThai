/**
 * TanStack queryOptions factories for discovery, search, notifications, me, and profile.
 *
 * Exports: discoverQueryOptions, searchQueryOptions, notificationsQueryOptions,
 *   meQueryOptions, profileQueryOptions
 * Depends on: @tanstack/react-query, @/features/session, @/lib/mock-data, @/shared/types
 */

import { queryOptions } from "@tanstack/react-query";
import type { DataMode } from "@/features/session/data-mode";
import type {
  SocialDiscoverData,
  SocialMeData,
  SocialNotificationsData,
  SocialProfileData,
  SocialSearchData,
} from "@/shared/types";
import { discoveryKeys } from "./keys";

/**
 * Build discover-grid query options (demo or live).
 * @param mode - demo or live query-key segment
 * @param fetchLive - live serverFn caller
 * @returns TanStack queryOptions for the discover grid
 */
export function discoverQueryOptions(
  mode: DataMode,
  fetchLive: () => Promise<SocialDiscoverData>,
): ReturnType<typeof buildDiscoverQueryOptions> {
  return buildDiscoverQueryOptions(mode, fetchLive);
}

function buildDiscoverQueryOptions(mode: DataMode, fetchLive: () => Promise<SocialDiscoverData>) {
  return queryOptions({
    queryKey: discoveryKeys.discover(mode),
    queryFn: (): Promise<SocialDiscoverData> =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockDiscover()) : fetchLive(),
    staleTime: 30_000,
  });
}

/**
 * Build search query options; disabled when q is empty at call site.
 * @param mode - demo or live query-key segment
 * @param q - search string
 * @param fetchLive - live serverFn caller
 * @returns TanStack queryOptions for search results
 */
export function searchQueryOptions(
  mode: DataMode,
  q: string,
  fetchLive: () => Promise<SocialSearchData>,
): ReturnType<typeof buildSearchQueryOptions> {
  return buildSearchQueryOptions(mode, q, fetchLive);
}

function buildSearchQueryOptions(
  mode: DataMode,
  q: string,
  fetchLive: () => Promise<SocialSearchData>,
) {
  return queryOptions({
    queryKey: discoveryKeys.search(mode, q),
    queryFn: (): Promise<SocialSearchData> =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.searchMock(q)) : fetchLive(),
    enabled: q.length > 0,
  });
}

/**
 * Build notifications query options.
 * @param mode - demo or live query-key segment
 * @param fetchLive - live serverFn caller
 * @returns TanStack queryOptions for the activity feed
 */
export function notificationsQueryOptions(
  mode: DataMode,
  fetchLive: () => Promise<SocialNotificationsData>,
): ReturnType<typeof buildNotificationsQueryOptions> {
  return buildNotificationsQueryOptions(mode, fetchLive);
}

function buildNotificationsQueryOptions(
  mode: DataMode,
  fetchLive: () => Promise<SocialNotificationsData>,
) {
  return queryOptions({
    queryKey: discoveryKeys.notifications(mode),
    queryFn: (): Promise<SocialNotificationsData> =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockNotifications()) : fetchLive(),
    staleTime: 15_000,
  });
}

/**
 * Build signed-in "me" query options.
 * @param mode - demo or live query-key segment
 * @param fetchLive - live serverFn caller
 * @returns TanStack queryOptions for the signed-in profile bundle
 */
export function meQueryOptions(
  mode: DataMode,
  fetchLive: () => Promise<SocialMeData>,
): ReturnType<typeof buildMeQueryOptions> {
  return buildMeQueryOptions(mode, fetchLive);
}

function buildMeQueryOptions(mode: DataMode, fetchLive: () => Promise<SocialMeData>) {
  return queryOptions({
    queryKey: discoveryKeys.me(mode),
    queryFn: (): Promise<SocialMeData> =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockMe()) : fetchLive(),
  });
}

/**
 * Build public profile query options by username.
 * @param username - profile username
 * @param mode - demo or live query-key segment
 * @param fetchLive - live serverFn caller
 * @returns TanStack queryOptions for a public profile
 */
export function profileQueryOptions(
  username: string,
  mode: DataMode,
  fetchLive: () => Promise<SocialProfileData>,
): ReturnType<typeof buildProfileQueryOptions> {
  return buildProfileQueryOptions(username, mode, fetchLive);
}

function buildProfileQueryOptions(
  username: string,
  mode: DataMode,
  fetchLive: () => Promise<SocialProfileData>,
) {
  return queryOptions({
    queryKey: discoveryKeys.profile(username, mode),
    queryFn: (): Promise<SocialProfileData> =>
      mode === "demo" ? import("@/features/demo").then((demo) => demo.getMockProfile(username)) : fetchLive(),
  });
}
