type PostMediaSource = {
  post_type: string;
  media_urls?: string[] | null;
};

export function isPhotoMediaUrl(url: string) {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(trimmed)) return false;
  return (
    /\.(jpe?g|png|gif|webp|avif|bmp)(\?|$)/i.test(trimmed) ||
    /images\.unsplash\.com|images\.pexels\.com|i\.pravatar\.cc|giphy\.com/i.test(trimmed)
  );
}

/** GIF / Giphy backdrops already animate — skip Ken Burns pan/zoom on top. */
export function isAnimatedPhotoUrl(url: string) {
  const trimmed = url.trim();
  return /\.gif(\?|$)/i.test(trimmed) || /giphy\.com/i.test(trimmed);
}

/** First image URL on a post — used even when post_type drifted to "text" in the DB. */
export function getPostPhotoUrl(post: PostMediaSource) {
  for (const url of post.media_urls ?? []) {
    if (url && isPhotoMediaUrl(url)) return url;
  }
  return null;
}

export function hasPostPhotoBackdrop(post: PostMediaSource) {
  return Boolean(getPostPhotoUrl(post));
}
