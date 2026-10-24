/**
 * Which metal a streak milestone is struck in, and what it says.
 *
 * Presentation only — lib/streak decides what is earned, this decides how it looks. The
 * celebration and the earned row in the saved drawer both read it, so a 20-day badge is
 * silver in both places. The colours themselves live in vocabulary.css under
 * `[data-tier]`; this only names the tier.
 *
 * Exports: StreakTier, streakTier, STREAK_TIER_LABEL, streakBlurb
 * Depends on: nothing
 */

export type StreakTier = "bronze" | "silver" | "gold" | "diamond";

/**
 * @param days - An earned milestone, in days
 * @returns The tier the badge is drawn in
 */
export function streakTier(days: number): StreakTier {
  if (days >= 150) return "diamond";
  if (days >= 50) return "gold";
  if (days >= 20) return "silver";
  return "bronze";
}

export const STREAK_TIER_LABEL: Record<StreakTier, string> = {
  bronze: "Huy hiệu Đồng",
  silver: "Huy hiệu Bạc",
  gold: "Huy hiệu Vàng",
  diamond: "Huy hiệu Kim cương",
};

const BLURBS: Record<number, string> = {
  5: "Năm ngày liền tay — ngọn lửa đã được thắp.",
  10: "Mười ngày bền bỉ — thói quen đang thành hình.",
  20: "Hai mươi ngày — học mỗi ngày đã thành nếp.",
  30: "Tròn một tháng, không bỏ ngày nào!",
  50: "Nửa trăm ngày không gián đoạn.",
  75: "Bảy mươi lăm ngày — không gì cản nổi bạn.",
  100: "Một trăm ngày! Cột mốc của người kiên trì thật sự.",
  150: "Một trăm rưỡi ngày — đẳng cấp đã khác.",
  200: "Hai trăm ngày bền chí, chưa một lần đứt chuỗi.",
  300: "Ba trăm ngày — gần trọn một vòng năm.",
  365: "Trọn một năm học mỗi ngày. Huyền thoại!",
};

/**
 * @param days - An earned milestone, in days
 * @returns The line under the headline
 */
export function streakBlurb(days: number): string {
  return BLURBS[days] ?? `${days} ngày liên tiếp — giữ lửa nhé!`;
}
