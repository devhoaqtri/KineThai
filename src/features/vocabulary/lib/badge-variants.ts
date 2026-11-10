/**
 * The looks the first-visit "Từ gì mà ..." badge can wear: its card face and the backdrop
 * behind it. Every look keeps the same timeline (DEMO_BADGE_MS, the keyframes in
 * vocabulary.css): only paint changes, so swapping one for another never changes when the
 * card underneath starts. Compared side by side at /badge-lab (dev only).
 *
 * Exports: BADGE_VARIANTS, BADGE_INFO, BadgeVariant, DEMO_BADGE_VARIANT, BADGE_ROTATION,
 *   pickBadgeVariant
 * Depends on: nothing
 */

export const BADGE_VARIANTS = [
  "classic",
  "aurora",
  "holo",
  "glass",
  "neon",
  "sunrise",
  "mint",
] as const;

export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

/** The look a badge falls back to: the first of the rotation. */
export const DEMO_BADGE_VARIANT: BadgeVariant = "aurora";

/** The looks the feed rotates through, one per word, chosen at /badge-lab. */
export const BADGE_ROTATION: readonly BadgeVariant[] = ["aurora", "glass", "mint", "sunrise"];

/**
 * The rotation's look for the word at one place in the stream. By position, not by word:
 * a hash of the word could hand two neighbours the same look, and the point is that each
 * word arrives differently. The same place always gets the same look, so a word scrolled
 * back to wears what it wore.
 * @param position - the word's index in the stream (0 for the first)
 * @pure true
 */
export function pickBadgeVariant(position: number): BadgeVariant {
  const index = Math.max(0, Math.floor(position)) % BADGE_ROTATION.length;
  return BADGE_ROTATION[index] ?? DEMO_BADGE_VARIANT;
}

/** Lab copy: a name and one line on what each look does. */
export const BADGE_INFO: Record<BadgeVariant, { name: string; blurb: string }> = {
  classic: {
    name: "Classic",
    blurb: "Thẻ trắng trên nền tối mờ — bản đầu tiên.",
  },
  aurora: {
    name: "Aurora",
    blurb: "Cực quang tím, xanh, hồng trôi sau lớp mờ; thẻ chuyển màu chàm sang hồng, chữ trắng.",
  },
  holo: {
    name: "Holo foil",
    blurb: "Giấy kim tuyến ánh cầu vồng trượt qua mặt thẻ; nền phủ sương sáng, vòng sóng bảy màu.",
  },
  glass: {
    name: "Frosted glass",
    blurb: "Thẻ kính mờ viền chuyển màu, quầng cam hồng phía sau, đèn rọi giữa nền tối.",
  },
  neon: {
    name: "Neon grid",
    blurb: "Thẻ đen viền neon xoay vòng, chữ chuyển màu phát sáng, lưới synthwave dưới nền.",
  },
  sunrise: {
    name: "Sunrise",
    blurb: "Tia nắng xoay chậm sau thẻ kem đào, chữ cam hồng, nền ấm dâng từ dưới lên.",
  },
  mint: {
    name: "Lá mint",
    blurb: "Màu thương hiệu chayLá: thẻ xanh bạc hà bóng, nền xanh lá thẫm có đốm sáng bay lên.",
  },
};
