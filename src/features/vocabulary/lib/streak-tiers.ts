/**
 * Which metal a streak milestone is struck in, and what it says.
 *
 * Presentation only — lib/streak decides what is earned, this decides how it looks. The
 * celebration and the earned row in the saved drawer both read it, so a 20-day badge is
 * silver in both places. The colours themselves live in vocabulary.css under
 * `[data-tier]`; this only names the tier.
 *
 * The daily goals (./daily-goal) are drawn here too: each medal shows how many days it has
 * been earned, and the goal's size picks its metal.
 *
 * Exports: StreakTier, streakTier, STREAK_TIER_LABEL, streakTierLabel, streakBlurb,
 *   dailyTier, repeatTier, dailyBadgeTitle, dailyBadgeBlurb
 * Depends on: ./locale
 */

import { localeCopy, type Locale } from "./locale";

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

const TIER_LABELS: Partial<Record<Locale, Record<StreakTier, string>>> = {
  vi: STREAK_TIER_LABEL,
  ja: {
    bronze: "ブロンズバッジ",
    silver: "シルバーバッジ",
    gold: "ゴールドバッジ",
    diamond: "ダイヤモンドバッジ",
  },
  th: {
    bronze: "เหรียญทองแดง",
    silver: "เหรียญเงิน",
    gold: "เหรียญทอง",
    diamond: "เหรียญเพชร",
  },
};

export function streakTierLabel(tier: StreakTier, uiLocale: Locale = "vi"): string {
  return localeCopy(TIER_LABELS, uiLocale)[tier];
}

const BLURBS_VI: Record<number, string> = {
  3: "Ba ngày liền tay — ngọn lửa đã được thắp.",
  5: "Năm ngày liền tay — ngọn lửa đã được thắp.",
  7: "Tròn một tuần không bỏ ngày nào!",
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

const BLURBS_JA: Record<number, string> = {
  3: "3日連続達成 ― 小さな火が灯りました。",
  5: "5日連続達成 ― 良いリズムが生まれています。",
  7: "1週間毎日継続できました！",
  10: "10日間コツコツ継続 ― 習慣が形になってきました。",
  20: "20日間達成 ― 毎日の学習がすっかり定着しました。",
  30: "まる1ヶ月、1日も欠かさず達成！",
  50: "50日連続、途切れることなく継続中。",
  75: "75日達成 ― もう誰にも止められません。",
  100: "100日達成！本物の継続力の証です。",
  150: "150日達成 ― 新たな境地へ。",
  200: "200日連続、一度も途切れずここまで来ました。",
  300: "300日達成 ― 1年まであと少し。",
  365: "まる1年、毎日学習達成。レジェンド！",
};

const BLURBS_TH: Record<number, string> = {
  3: "3 วันติดต่อกัน — จุดประกายไฟแห่งการเรียนรู้แล้ว",
  5: "5 วันติดต่อกัน — จุดประกายไฟแห่งการเรียนรู้แล้ว",
  7: "ครบหนึ่งสัปดาห์โดยไม่เว้นแม้แต่วันเดียว!",
  10: "10 วันแห่งความพยายาม — นิสัยเริ่มก่อตัวขึ้นแล้ว",
  20: "20 วันแล้ว — การเรียนทุกวันกลายเป็นกิจวัตร",
  30: "ครบหนึ่งเดือนเต็มโดยไม่ขาดเลย!",
  50: "ครึ่งร้อยวันอย่างต่อเนื่องไม่มีสะดุด",
  75: "75 วันแล้ว — ไม่มีอะไรหยุดคุณได้",
  100: "100 วัน! หมุดหมายของคนที่มีความเพียรอย่างแท้จริง",
  150: "150 วัน — ก้าวสู่ระดับที่ต่างออกไป",
  200: "200 วันแห่งความมุ่งมั่น ไม่เคยขาดตอน",
  300: "300 วัน — เกือบครบหนึ่งรอบปีแล้ว",
  365: "เรียนทุกวันครบหนึ่งปีเต็ม ตำนานตัวจริง!",
};

/**
 * @param days - An earned milestone, in days
 * @param uiLocale - Optional UI locale (defaults to "vi")
 * @returns The line under the headline
 */
export function streakBlurb(days: number, uiLocale: Locale = "vi"): string {
  if (uiLocale === "ja") {
    return BLURBS_JA[days] ?? `${days}日連続達成 ― この調子で続けましょう！`;
  }
  if (uiLocale === "th") {
    return BLURBS_TH[days] ?? `ต่อเนื่อง ${days} วัน — รักษาไฟไว้เลย!`;
  }
  return BLURBS_VI[days] ?? `${days} ngày liên tiếp — giữ lửa nhé!`;
}

/**
 * @param goal - Words in a day: 10, 25 or 50
 * @returns Its metal — the bigger the day, the finer the medal; diamond is kept for the
 *   streak's long runs and for finishing a whole level
 */
export function dailyTier(goal: number): StreakTier {
  if (goal >= 50) return "gold";
  if (goal >= 25) return "silver";
  return "bronze";
}

/**
 * @param of - Which short goal repeats: the daily goal, or a run of days
 * @param base - The goal's words, or the run's days
 * @param times - How many times it must be met
 * @returns Its metal: always finer than the goal met once (bronze), finer still the longer
 *   the run or the more days it asks for
 */
export function repeatTier(of: "daily" | "streak", base: number, times: number): StreakTier {
  if (of === "daily") return times >= 20 ? "diamond" : times >= 10 ? "gold" : "silver";
  return base >= 10 ? "gold" : "silver";
}

/** @param goal - Words in a day @param times - The count just reached @returns The headline */
export function dailyBadgeTitle(goal: number, times: number, uiLocale: Locale = "vi"): string {
  if (uiLocale === "ja") {
    return times === 1 ? `1日で ${goal} 語達成！` : `${times}回目：1日で ${goal} 語達成！`;
  }
  if (uiLocale === "th") {
    return times === 1 ? `${goal} คำในหนึ่งวัน!` : `ครั้งที่ ${times}: ${goal} คำในหนึ่งวัน!`;
  }
  return times === 1 ? `${goal} từ trong một ngày!` : `Lần thứ ${times}: ${goal} từ trong ngày!`;
}

/** @param goal - Words in a day @param times - The count just reached @returns The line under it */
export function dailyBadgeBlurb(goal: number, times: number, uiLocale: Locale = "vi"): string {
  if (uiLocale === "ja") {
    if (times === 1) {
      return `1日${goal}語バッジ ― 1日に${goal}語学ぶたびに回数が1つ増えます。`;
    }
    return `1日${goal}語を${times}日達成しました。バッジの記録がさらに伸びていきます。`;
  }
  if (uiLocale === "th") {
    if (times === 1) {
      return `เหรียญ ${goal} คำ/วัน — ทุกวันที่เรียนครบ ${goal} คำ จะนับเพิ่มอีกหนึ่งครั้ง`;
    }
    return `คุณเรียนครบ ${goal} คำมาแล้ว ${times} วัน เหรียญนี้จะนับเพิ่มขึ้นเรื่อยๆ`;
  }
  if (times === 1) {
    return `Huy hiệu ${goal} từ/ngày — mỗi ngày học đủ ${goal} từ, nó sẽ đếm thêm một lần.`;
  }
  return `Đã ${times} ngày bạn học đủ ${goal} từ. Huy hiệu cứ thế đếm lên.`;
}
