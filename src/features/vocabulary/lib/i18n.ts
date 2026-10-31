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
 * KineThai overlay: locale-parametric wrappers (topicLabel/themeLabel/styleLabel/
 * douyinStyleLabel/posLabel + LabelSet/LOCALE_LABELS) sit on top of the upstream
 * Vietnamese maps below. The UI default is Japanese (DEFAULT_LOCALE = "ja");
 * Vietnamese (BASE_LOCALE) is the data fallback. The English answer is never
 * translated.
 *
 * Exports: TOPIC_LABELS_VI, THEME_LABELS_VI, STYLE_LABELS_VI, DOUYIN_STYLE_LABELS_VI,
 *   POS_LABELS_VI, topicLabelVi, themeLabelVi, styleLabelVi, douyinStyleLabelVi,
 *   posLabelVi, LabelSet, LOCALE_LABELS, topicLabel, themeLabel, styleLabel,
 *   douyinStyleLabel, posLabel
 * Depends on: ./locale (UI default + data fallback), ./schema (NarrativeStyle)
 */

import type { Locale } from "./locale";
import { BASE_LOCALE, DEFAULT_LOCALE } from "./locale";
import type { NarrativeStyle } from "./schema";

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
  food: "Ẩm thực",
  general: "Chung",
  health: "Sức khỏe",
  money: "Tiền bạc",
  nature: "Thiên nhiên",
  perception: "Nhận thức",
  society: "Xã hội",
  study: "Học tập",
  technology: "Công nghệ",
  travel: "Du lịch",
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
  "paper-dawn": "Bình minh giấy",
  "linen-sage": "Vải lanh xô thơm",
  "porcelain-blush": "Sứ hồng phấn",
  "almond-sky": "Trời hạnh nhân",
  "frost-lilac": "Tử đinh hương sương",
  "oat-mint": "Yến mạch bạc hà",
  "chalk-periwinkle": "Phấn dừa cạn",
  "shell-celadon": "Vỏ sò men ngọc",
  "dove-apricot": "Bồ câu mơ",
  snowfall: "Tuyết rơi",
  "graphite-veil": "Màn than chì",
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

// ── KineThai locale-parametric overlay (Japanese default, Vietnamese fallback) ──
// Upstream ships only the Vietnamese maps above. The overlay below adds the Thai +
// Japanese label sets backed up from the pre-merge tree. Missing locale entries
// fall back to Vietnamese (BASE_LOCALE), never to blanks.

/** The complete set of catalog label strings for one UI locale. */
export type LabelSet = {
  /** Catalog topic slug → name shown in the topic picker. */
  topics: Record<string, string>;
  /** Palette id → colour-story name. */
  themes: Record<string, string>;
  /** Narrative style id → reveal name. */
  styles: Record<string, string>;
  /** Douyin-dialect style id → mainland short-video name. */
  douyinStyles: Record<string, string>;
  /** Part-of-speech code → grammar label. */
  pos: Record<string, string>;
};

const TOPIC_LABELS_TH: Record<string, string> = {
  attention: "ความสนใจ",
  character: "บุคลิกภาพ",
  communication: "การสื่อสาร",
  daily: "ชีวิตประจำวัน",
  emotion: "อารมณ์",
  thinking: "ความคิด",
  time: "เวลา",
  work: "งาน",
  food: "อาหาร",
  general: "ทั่วไป",
  health: "สุขภาพ",
  money: "การเงิน",
  nature: "ธรรมชาติ",
  perception: "การรับรู้",
  society: "สังคม",
  study: "การเรียน",
  technology: "เทคโนโลยี",
  travel: "การเดินทาง",
};

const TOPIC_LABELS_JA: Record<string, string> = {
  attention: "注意",
  character: "性格",
  communication: "コミュニケーション",
  daily: "日常",
  emotion: "感情",
  thinking: "思考",
  time: "時間",
  work: "仕事",
  food: "食べ物",
  general: "一般",
  health: "健康",
  money: "お金",
  nature: "自然",
  perception: "知覚",
  society: "社会",
  study: "学習",
  technology: "テクノロジー",
  travel: "旅行",
};

const STYLE_LABELS_TH: Record<string, string> = {
  detective: "นักสืบ",
  speed: "ความเร็ว",
  confession: "สารภาพ",
  minimal: "มินิมอล",
};

const STYLE_LABELS_JA: Record<string, string> = {
  detective: "探偵",
  speed: "スピード",
  confession: "告白",
  minimal: "ミニマル",
};

const DOUYIN_STYLE_LABELS_TH: Record<string, string> = {
  detective: "ตื่นเต้น",
  speed: "จังหวะเร็ว",
  confession: "อารมณ์",
  minimal: "สไตล์จีน",
};

const DOUYIN_STYLE_LABELS_JA: Record<string, string> = {
  detective: "サスペンス",
  speed: "リズム",
  confession: "エモーション",
  minimal: "中華風",
};

const POS_LABELS_TH: Record<string, string> = {
  adj: "คำคุณศัพท์",
  adjective: "คำคุณศัพท์",
  adv: "คำวิเศษณ์",
  adverb: "คำวิเศษณ์",
  noun: "คำนาม",
  v: "คำกริยา",
  verb: "คำกริยา",
  prep: "คำบุพบท",
  preposition: "คำบุพบท",
  conj: "คำสันธาน",
  pron: "คำสรรพนาม",
  pronoun: "คำสรรพนาม",
};

const POS_LABELS_JA: Record<string, string> = {
  adj: "形容詞",
  adjective: "形容詞",
  adv: "副詞",
  adverb: "副詞",
  noun: "名詞",
  v: "動詞",
  verb: "動詞",
  prep: "前置詞",
  preposition: "前置詞",
  conj: "接続詞",
  pron: "代名詞",
  pronoun: "代名詞",
};

// Theme (palette) names: upstream Vietnamese map is the base; Thai + Japanese
// overlays translate the stable palette ids. New upstream palettes (Douyin, CNY)
// fall back to Vietnamese, then to the palette's own label.
const THEME_LABELS_TH: Record<string, string> = {
  "midnight-magenta": "ม่วงแดงเที่ยงคืน",
  "deep-lagoon": "ทะเลสาบลึก",
  "forest-ember": "ป่าเพลิง",
  "indigo-dusk": "ครามยามเย็น",
  "olive-brass": "มะกอกทองเหลือง",
  "plum-orchid": "บ๊วยกล้วยไม้",
  "slate-cyan": "เทาฟ้า",
  "obsidian-lime": "ดำมะนาว",
  "teal-sunrise": "เขียวเป็ดรุ่งอรุณ",
  "cobalt-flare": "โคบอลต์เจิดจ้า",
  "rose-quartz": "กุหลาบควอตซ์",
  "morning-mint": "มิ้นต์ยามเช้า",
  "azure-linen": "ฟ้าผ้าลินิน",
  "paper-amber": "กระดาษอำพัน",
  "apple-frost": "แอปเปิลน้ำค้างแข็ง",
  "apple-sand": "แอปเปิลทราย",
  "apple-graphite": "แอปเปิลแกรไฟต์",
  "apple-twilight": "แอปเปิลสนธยา",
  "obsidian-vault": "ห้องนิรภัยออบซิเดียน",
  "phantom-rose": "กุหลาบลวงตา",
  "ink-wash": "หมึกพู่กัน",
  "midnight-ember": "ถ่านเที่ยงคืน",
  "vermillion-jade": "ชาดหยก",
  "ink-bamboo": "หมึกไผ่",
  "lotus-gold": "บัวทอง",
  "indigo-porcelain": "ครามกระเบื้อง",
  "douyin-neon": "นีออนโต่วอิน",
  "guochao-red": "แดงกั๋วเฉา",
  "neon-night": "ค่ำคืนนีออน",
  "jade-mist": "หมอกหยก",
  "ink-gold": "หมึกทอง",
  "ink-landscape": "ภาพหมึกพู่กัน",
  "celadon-blue": "เขียวศิลาดล",
  "cinnabar-gold": "ชาดทอง",
  "porcelain-blue": "ครามเครื่องเคลือบ",
  "plum-blossom": "ดอกเหมย",
  "spring-crimson": "แดงวสันต์",
  "hongbao-gold": "อั่งเปาทอง",
  "lantern-paper-cut": "โคมกระดาษตัด",
  "paper-dawn": "รุ่งอรุณกระดาษ",
  "linen-sage": "ลินินเซจ",
  "porcelain-blush": "กระเบื้องชมพู",
  "almond-sky": "ฟ้าอัลมอนด์",
  "frost-lilac": "ไลแลคน้ำค้างแข็ง",
  "oat-mint": "ข้าวโอ๊ตมินต์",
  "chalk-periwinkle": "ชอล์กพีริวิงเคิล",
  "shell-celadon": "เปลือกหอยเซลาดอน",
  "dove-apricot": "นกพิราบแอปริคอต",
  snowfall: "หิมะโปรย",
  "graphite-veil": "ม่านกราไฟต์",
};

const THEME_LABELS_JA: Record<string, string> = {
  "midnight-magenta": "真夜中のマゼンタ",
  "deep-lagoon": "深いラグーン",
  "forest-ember": "森の残り火",
  "indigo-dusk": "藍の夕暮れ",
  "olive-brass": "オリーブブラス",
  "plum-orchid": "梅と蘭",
  "slate-cyan": "スレートシアン",
  "obsidian-lime": "黒曜とライム",
  "teal-sunrise": "ティールの朝日",
  "cobalt-flare": "コバルトの閃光",
  "rose-quartz": "ローズクォーツ",
  "morning-mint": "朝のミント",
  "azure-linen": "空色リネン",
  "paper-amber": "紙のアンバー",
  "apple-frost": "林檎の霜",
  "apple-sand": "林檎の砂",
  "apple-graphite": "林檎の黒鉛",
  "apple-twilight": "林檎の黄昏",
  "obsidian-vault": "黒曜の宝庫",
  "phantom-rose": "幻の薔薇",
  "ink-wash": "水墨",
  "midnight-ember": "真夜中の残り火",
  "vermillion-jade": "朱と翡翠",
  "ink-bamboo": "墨と竹",
  "lotus-gold": "蓮と金",
  "indigo-porcelain": "藍の磁器",
  "douyin-neon": "Douyin ネオン",
  "guochao-red": "国潮レッド",
  "neon-night": "ネオンナイト",
  "jade-mist": "翡翠の霞",
  "ink-gold": "墨と金",
  "ink-landscape": "山水画",
  "celadon-blue": "青磁ブルー",
  "cinnabar-gold": "辰砂と金",
  "porcelain-blue": "青花磁器",
  "plum-blossom": "梅花",
  "spring-crimson": "春節クリムゾン",
  "hongbao-gold": "紅包ゴールド",
  "lantern-paper-cut": "切り絵ランタン",
  "paper-dawn": "和紙の夜明け",
  "linen-sage": "リネンセージ",
  "porcelain-blush": "磁器の薄紅",
  "almond-sky": "アーモンドの空",
  "frost-lilac": "霜のライラック",
  "oat-mint": "オーツミント",
  "chalk-periwinkle": "チョークペリウィンクル",
  "shell-celadon": "貝殻と青磁",
  "dove-apricot": "鳩羽とアプリコット",
  snowfall: "雪景色",
  "graphite-veil": "グラファイトのヴェール",
};

/** Locale → label set. Stub locales fall back to Vietnamese via the helpers below. */
export const LOCALE_LABELS: Record<Locale, LabelSet> = {
  vi: {
    topics: TOPIC_LABELS_VI,
    themes: THEME_LABELS_VI,
    styles: STYLE_LABELS_VI,
    douyinStyles: DOUYIN_STYLE_LABELS_VI,
    pos: POS_LABELS_VI,
  },
  th: {
    topics: TOPIC_LABELS_TH,
    themes: THEME_LABELS_TH,
    styles: STYLE_LABELS_TH,
    douyinStyles: DOUYIN_STYLE_LABELS_TH,
    pos: POS_LABELS_TH,
  },
  ja: {
    topics: TOPIC_LABELS_JA,
    themes: THEME_LABELS_JA,
    styles: STYLE_LABELS_JA,
    douyinStyles: DOUYIN_STYLE_LABELS_JA,
    pos: POS_LABELS_JA,
  },
  zh: { topics: {}, themes: {}, styles: {}, douyinStyles: {}, pos: {} },
  ko: { topics: {}, themes: {}, styles: {}, douyinStyles: {}, pos: {} },
  fil: { topics: {}, themes: {}, styles: {}, douyinStyles: {}, pos: {} },
};

/** Base (Vietnamese) label set — the fallback every helper degrades to. */
const BASE_LABELS: LabelSet = LOCALE_LABELS[BASE_LOCALE]!;

/** Topic name, falling back to Vietnamese then to the slug itself. */
export function topicLabel(topic: string, locale: Locale = DEFAULT_LOCALE): string {
  return LOCALE_LABELS[locale].topics[topic] ?? BASE_LABELS.topics[topic] ?? topic;
}

/** Theme name, falling back to Vietnamese then to the palette's own label. */
export function themeLabel(id: string, fallback: string, locale: Locale = DEFAULT_LOCALE): string {
  return LOCALE_LABELS[locale].themes[id] ?? BASE_LABELS.themes[id] ?? fallback;
}

/** Narrative style name, falling back to Vietnamese then to the preset label. */
export function styleLabel(id: string, fallback: string, locale: Locale = DEFAULT_LOCALE): string {
  return LOCALE_LABELS[locale].styles[id] ?? BASE_LABELS.styles[id] ?? fallback;
}

/** Douyin-dialect style name, falling back to Vietnamese then to the preset label. */
export function douyinStyleLabel(
  id: string,
  fallback: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return LOCALE_LABELS[locale].douyinStyles[id] ?? BASE_LABELS.douyinStyles[id] ?? fallback;
}

/** Part-of-speech label, falling back to Vietnamese then to the stored code. */
export function posLabel(pos: string, locale: Locale = DEFAULT_LOCALE): string {
  const key = pos.toLowerCase();
  return LOCALE_LABELS[locale].pos[key] ?? BASE_LABELS.pos[key] ?? pos;
}

type StageLabels = {
  definition: string;
  usage: string;
  anticipation: string;
  letters: string;
  lettersText: string;
  /** Han-answer variant of the letter-count sentence (no pinyin initial). */
  lettersTextHan: string;
  /** Han-answer variant naming the first pinyin letter. */
  lettersTextHanPinyin: string;
  reveal: string;
  lead: Record<NarrativeStyle, string>;
};

const STAGE_LABELS: Record<Locale, StageLabels | undefined> = {
  vi: {
    definition: "Ý nghĩa",
    usage: "Trong câu",
    anticipation: "Bạn đoán gì?",
    letters: "Đếm chữ cái",
    lettersText: "Gồm {count} chữ cái, bắt đầu bằng {initial}",
    lettersTextHan: "Gồm {count} chữ Hán",
    lettersTextHanPinyin: "Gồm {count} chữ Hán, pinyin bắt đầu bằng {initial}",
    reveal: "Đây rồi!",
    lead: {
      detective: "Bối cảnh",
      speed: "Sẵn sàng chưa?",
      confession: "Có quen không?",
      minimal: "Một suy nghĩ",
    },
  },
  th: {
    definition: "ความหมาย",
    usage: "ในประโยค",
    anticipation: "เดาสิ?",
    letters: "นับตัวอักษร",
    lettersText: "มี {count} ตัวอักษร ขึ้นต้นด้วย {initial}",
    lettersTextHan: "มี {count} ตัวอักษรจีน",
    lettersTextHanPinyin: "มี {count} ตัวอักษรจีน พินอินขึ้นต้นด้วย {initial}",
    reveal: "นี่ไง!",
    lead: {
      detective: "บริบท",
      speed: "พร้อมไหม?",
      confession: "คุ้นไหม?",
      minimal: "หนึ่งความคิด",
    },
  },
  ja: {
    definition: "意味",
    usage: "例文",
    anticipation: "当ててみて！",
    letters: "文字数",
    lettersText: "{count} 文字、{initial} で始まる",
    lettersTextHan: "{count} 文字の漢字",
    lettersTextHanPinyin: "{count} 文字の漢字、ピンインは {initial} で始まる",
    reveal: "これだ！",
    lead: {
      detective: "状況",
      speed: "準備はいい？",
      confession: "見覚えある？",
      minimal: "ひとつの想い",
    },
  },
  zh: undefined,
  ko: undefined,
  fil: undefined,
};

/** Stage (page) label for a given role, falling back to Vietnamese. */
export function stageLabel(
  role: "definition" | "usage" | "anticipation" | "letters" | "reveal",
  locale: Locale = DEFAULT_LOCALE,
): string {
  return STAGE_LABELS[locale]?.[role] ?? STAGE_LABELS[BASE_LOCALE]![role]!;
}

/** Lead-page label, which depends on the narrative style. */
export function leadLabel(style: NarrativeStyle, locale: Locale = DEFAULT_LOCALE): string {
  return STAGE_LABELS[locale]?.lead[style] ?? STAGE_LABELS[BASE_LOCALE]!.lead[style]!;
}

/** Filled letter-count sentence, localized, falling back to Vietnamese. */
export function lettersSentence(
  count: number,
  initial: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const template = STAGE_LABELS[locale]?.lettersText ?? STAGE_LABELS[BASE_LOCALE]!.lettersText;
  return template.replace("{count}", String(count)).replace("{initial}", initial);
}

/** Filled Han-character-count sentence, localized, falling back to Vietnamese. */
export function hanLettersSentence(
  count: number,
  pinyinInitial: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const set = STAGE_LABELS[locale] ?? STAGE_LABELS[BASE_LOCALE]!;
  const template = pinyinInitial ? set.lettersTextHanPinyin : set.lettersTextHan;
  return template.replace("{count}", String(count)).replace("{initial}", pinyinInitial);
}
