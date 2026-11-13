/**
 * Vietnamese display names for the vocabulary feed's option sheet.
 *
 * The stored identifiers are the contract — topic slugs come from the catalog, and theme
 * and style ids come from the palette collection and the motion presets — so only the
 * LABELS are translated here. The source strings stay English in their own modules
 * because the admin surfaces (export studio, template manager) still read them, and a
 * palette added by an admin has no entry in this map: every lookup takes the source
 * label as a fallback rather than rendering a blank or an id.
 *
 * Exports: TOPIC_LABELS_VI, THEME_LABELS_VI, STYLE_LABELS_VI, DOUYIN_STYLE_LABELS_VI,
 *   POS_LABELS_VI, topicLabelVi, themeLabelVi, styleLabelVi, douyinStyleLabelVi,
 *   posLabelVi
 * Depends on: none (leaf module)
 */

/** Catalog topic slug → the name shown in the "Chủ đề" picker. */
export const TOPIC_LABELS_VI: Record<string, string> = {
  attention: "Chú ý",
  character: "Tính cách",
  communication: "Giao tiếp",
  daily: "Đời thường",
  emotion: "Cảm xúc",
  thinking: "Suy nghĩ",
  time: "Thời gian",
  work: "Công việc",
};

/** Palette id → a Vietnamese name for the colour story it tells. */
export const THEME_LABELS_VI: Record<string, string> = {
  "midnight-magenta": "Đêm tím hồng",
  "deep-lagoon": "Vịnh nước sâu",
  "forest-ember": "Rừng than hồng",
  "indigo-dusk": "Chàm hoàng hôn",
  "olive-brass": "Ô liu đồng",
  "plum-orchid": "Mận tím lan",
  "slate-cyan": "Xám xanh lơ",
  "obsidian-lime": "Đen obsidian chanh",
  "teal-sunrise": "Cổ vịt bình minh",
  "cobalt-flare": "Cobalt rực",
  "rose-quartz": "Thạch anh hồng",
  "morning-mint": "Bạc hà sớm",
  "azure-linen": "Lam vải lanh",
  "paper-amber": "Giấy hổ phách",
  "apple-frost": "Táo sương",
  "apple-sand": "Táo cát",
  "apple-graphite": "Táo chì",
  "apple-twilight": "Táo chạng vạng",
  "obsidian-vault": "Hầm obsidian",
  "phantom-rose": "Hồng ảo ảnh",
  "ink-wash": "Thủy mặc",
  "midnight-ember": "Đêm lửa tàn",
  "vermillion-jade": "Son ngọc bích",
  "ink-bamboo": "Mực trúc",
  "lotus-gold": "Sen vàng",
  "indigo-porcelain": "Sứ chàm",
  // Douyin dialect (hoa.* only): the Chinese-version pool's own color stories.
  "douyin-neon": "Neon Douyin",
  "guochao-red": "Đỏ quốc triều",
  "neon-night": "Đêm neon",
  "jade-mist": "Sương ngọc bích",
  "ink-gold": "Vàng ánh mực",
  // Eastern artifact palettes (also hoa.* only): deeper cultural color stories.
  "ink-landscape": "Tranh thủy mặc",
  "celadon-blue": "Men ngọc xanh",
  "cinnabar-gold": "Chu sa vàng",
  "porcelain-blue": "Sứ Thanh hoa",
  "plum-blossom": "Mai hoa",
  // Chinese New Year (xuân / Tết) palettes — crimson, temple gold, rice-paper cream.
  "spring-crimson": "Đỏ xuân",
  "hongbao-gold": "Lì xì vàng",
  "lantern-paper-cut": "Đèn lồng giấy",
};

/** Narrative style id → the Vietnamese name of that reveal. */
export const STYLE_LABELS_VI: Record<string, string> = {
  detective: "Thám tử",
  speed: "Tốc độ",
  confession: "Tự sự",
  minimal: "Tối giản",
};

/**
 * The same four style ids under the Douyin dialect wear different motion and
 * different names: mainland short-video grammar instead of the default reveal styles.
 */
export const DOUYIN_STYLE_LABELS_VI: Record<string, string> = {
  detective: "Hồi hộp",
  speed: "Giật theo nhịp",
  confession: "Cảm xúc",
  minimal: "Quốc phong",
};

/**
 * Catalog part-of-speech code → Vietnamese grammar label. The deck stores these as the
 * English abbreviations ("adj", "verb", "noun"), which read as jargon on a Vietnamese
 * page, and the admin can add a code this map has never seen — hence the fallback.
 */
export const POS_LABELS_VI: Record<string, string> = {
  adj: "tính từ",
  adjective: "tính từ",
  adv: "trạng từ",
  adverb: "trạng từ",
  noun: "danh từ",
  v: "động từ",
  verb: "động từ",
  prep: "giới từ",
  preposition: "giới từ",
  conj: "liên từ",
  pron: "đại từ",
  pronoun: "đại từ",
  phrase: "cụm từ",
};

/**
 * Topic name in Vietnamese, falling back to the slug itself.
 * @param topic - Catalog topic slug
 * @returns Display name
 */
export function topicLabelVi(topic: string): string {
  return TOPIC_LABELS_VI[topic] ?? topic;
}

/**
 * Theme name in Vietnamese, falling back to the palette's own label so a newly added
 * palette is never rendered as an id.
 * @param id - Palette id
 * @param fallback - Label from the palette collection
 * @returns Display name
 */
export function themeLabelVi(id: string, fallback: string): string {
  return THEME_LABELS_VI[id] ?? fallback;
}

/**
 * Reveal name in Vietnamese, falling back to the preset's own label.
 * @param id - Narrative style id
 * @param fallback - Label from the style presets
 * @returns Display name
 */
export function styleLabelVi(id: string, fallback: string): string {
  return STYLE_LABELS_VI[id] ?? fallback;
}

/**
 * Reveal name in Vietnamese for the Douyin dialect, falling back to the preset's
 * own label.
 * @param id - Narrative style id
 * @param fallback - Label from the Douyin style presets
 * @returns Display name
 */
export function douyinStyleLabelVi(id: string, fallback: string): string {
  return DOUYIN_STYLE_LABELS_VI[id] ?? fallback;
}

/**
 * Part-of-speech label in Vietnamese, falling back to the stored code so an unknown
 * code still shows something rather than nothing.
 * @param pos - Catalog part-of-speech code
 * @returns Display label
 */
export function posLabelVi(pos: string): string {
  return POS_LABELS_VI[pos.toLowerCase()] ?? pos;
}
