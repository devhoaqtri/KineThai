/**
 * Authenticated home-feed server function and ranking helpers.
 *
 * Exports: getFeed
 * Depends on: supabase auth middleware, admin client
 */

import { createServerFn } from "@tanstack/react-start";
import { accountFeaturesGate } from "@/lib/account-features";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VOCAB_ONLY_MODE, isVocabularyPost } from "@/lib/feature-flags";

// ===== Authenticated feed reads =====

const FEED_LIMIT = 60;
const FEED_POOL_LIMIT = 180;
const COLD_START_FOLLOWING_THRESHOLD = 3;
const BOT_AUTHOR_RECENCY_WINDOW_HOURS = 30;
const BOT_AUTHOR_RECENCY_BOOST = 6_000;

type FeedPost = {
  id: string;
  author_id: string;
  post_type: string;
  canvas_html: string;
  media_urls: string[] | null;
  bg_gradient: string | null;
  created_at: string;
};
type FeedLike = { post_id: string; user_id: string };
type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  chip_id: string;
  created_at: string;
};

/**
 * Server function: getFeed.
 * @returns TanStack server function handle
 */
export const getFeed = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: viewer } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const { data: following } = viewer
      ? await supabaseAdmin.from("follows").select("following_id").eq("follower_id", viewer.id)
      : { data: [] as { following_id: string }[] };
    const followingIds = (following ?? []).map((follow) => follow.following_id);
    const { data: activeBots } = await supabaseAdmin
      .from("bot_agents")
      .select("profile_id")
      .eq("active", true);
    const botAuthorIds = (activeBots ?? []).map((bot) => bot.profile_id).filter(Boolean);

    const { data: feedPool, error } = await supabaseAdmin
      .from("posts")
      .select("id, author_id, post_type, canvas_html, media_urls, bg_gradient, created_at")
      .order("created_at", { ascending: false })
      .limit(FEED_POOL_LIMIT);
    if (error) throw new Error(error.message);

    let poolPosts = (feedPool ?? []) as FeedPost[];
    // Temporary vocab-only mode: hide non-vocabulary posts (reversible via src/lib/feature-flags.ts)
    if (VOCAB_ONLY_MODE) {
      const viewerId = viewer?.id ?? null;
      poolPosts = poolPosts.filter(
        (p) => isVocabularyPost(p) || (viewerId != null && p.author_id === viewerId),
      );
    }
    const poolPostIds = poolPosts.map((post) => post.id);
    if (poolPostIds.length === 0) {
      return { posts: [], profiles: [], likes: [], comments: [] };
    }

    const [{ data: poolLikes }, { data: poolComments }] = await Promise.all([
      supabaseAdmin.from("likes").select("post_id, user_id").in("post_id", poolPostIds),
      supabaseAdmin
        .from("comments")
        .select("id, post_id, user_id, chip_id, created_at")
        .in("post_id", poolPostIds),
    ]);

    const likes = (poolLikes ?? []) as FeedLike[];
    const comments = (poolComments ?? []) as FeedComment[];
    const rankedPosts = rankFeedPosts({
      posts: poolPosts,
      likes,
      comments,
      followingIds,
      botAuthorIds,
      viewerId: viewer?.id ?? null,
    }).slice(0, FEED_LIMIT);

    const selectedPostIds = new Set(rankedPosts.map((post) => post.id));
    const selectedComments = comments.filter((comment) => selectedPostIds.has(comment.post_id));
    const profileIds = [
      ...new Set([
        ...rankedPosts.map((post) => post.author_id),
        ...selectedComments.map((comment) => comment.user_id),
      ]),
    ];
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] };

    return {
      posts: rankedPosts,
      profiles: profiles ?? [],
      likes: likes.filter((like) => selectedPostIds.has(like.post_id)),
      comments: selectedComments,
    };
  });

/**
 * @responsibility Rank a pool of candidate posts for the authenticated feed.
 * @inputs posts, likes, comments, following set, bot author ids, viewer id
 * @outputs posts ordered by score (higher first); live path includes bot recency boost
 * @pure true
 * @note Demo mock ranking is a separate copy and currently omits bot boost — do not unify here.
 */
function rankFeedPosts({
  posts,
  likes,
  comments,
  followingIds,
  botAuthorIds,
  viewerId,
}: {
  posts: FeedPost[];
  likes: FeedLike[];
  comments: FeedComment[];
  followingIds: string[];
  botAuthorIds: string[];
  viewerId: string | null;
}) {
  const following = new Set(followingIds);
  const botAuthors = new Set(botAuthorIds);
  const engagement = buildFeedEngagement(likes, comments);
  const isColdStart = followingIds.length < COLD_START_FOLLOWING_THRESHOLD;

  return [...posts].sort((a, b) => {
    const scoreA = getFeedRankScore(
      a,
      engagement.get(a.id),
      following,
      botAuthors,
      viewerId,
      isColdStart,
    );
    const scoreB = getFeedRankScore(
      b,
      engagement.get(b.id),
      following,
      botAuthors,
      viewerId,
      isColdStart,
    );
    if (scoreA !== scoreB) return scoreB - scoreA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function buildFeedEngagement(likes: FeedLike[], comments: FeedComment[]) {
  const byPost = new Map<string, { likes: number; comments: number }>();
  for (const like of likes) {
    const current = byPost.get(like.post_id) ?? { likes: 0, comments: 0 };
    current.likes += 1;
    byPost.set(like.post_id, current);
  }
  for (const comment of comments) {
    const current = byPost.get(comment.post_id) ?? { likes: 0, comments: 0 };
    current.comments += 1;
    byPost.set(comment.post_id, current);
  }
  return byPost;
}

function getFeedRankScore(
  post: FeedPost,
  engagement: { likes: number; comments: number } | undefined,
  following: Set<string>,
  botAuthors: Set<string>,
  viewerId: string | null,
  isColdStart: boolean,
) {
  const likes = engagement?.likes ?? 0;
  const comments = engagement?.comments ?? 0;
  const popularity = likes * 2 + comments * 3;
  const ageHours = Math.max(1, (Date.now() - new Date(post.created_at).getTime()) / 3_600_000);
  const recency = 24 / Math.sqrt(ageHours);

  if (isColdStart) {
    return popularity * 100 + recency;
  }

  const relationshipBoost =
    following.has(post.author_id) || (viewerId != null && post.author_id === viewerId) ? 10_000 : 0;
  const botRecencyBoost =
    botAuthors.has(post.author_id) && ageHours <= BOT_AUTHOR_RECENCY_WINDOW_HOURS
      ? BOT_AUTHOR_RECENCY_BOOST
      : 0;
  return relationshipBoost + botRecencyBoost + popularity * 25 + recency;
}
