/**
 * The grammar of a word in its own language: plural, gender, conjugation class and
 * principal forms, the case or particle it governs, counters, honorifics, Sino-Vietnamese
 * readings, and the one trap a beginner falls into. It feeds the collapsed "Nâng cao"
 * section at the foot of the meaning panel.
 *
 * Three shapes, one table:
 *   • A generated deck writes every field FLAT on the card, `null` where it does not
 *     apply (gen-rules-{de,fr,es}.md v3; ko/ja/zh in docs/word-grammar-fields.md).
 *   • normalizeDeck folds them into ONE optional `word.grammar` object with every null
 *     dropped, so the served catalog carries nothing for a word without grammar and the
 *     panel has one thing to test.
 *   • `grammarRows` turns that object into labelled display rows. Grammar terms inside
 *     values are written in the target language ("stark", "passé composé", "ㅂ 불규칙"),
 *     so object keys are already their own native labels; this file only adds the
 *     Vietnamese gloss beside them. A new key needs a gloss entry here, never new UI.
 *
 * Exports: GRAMMAR_KEYS, grammarSchema, deckGrammarFields, foldGrammar, grammarRows,
 *   grammarHint, types WordGrammar, GrammarRow
 * Depends on: zod, ./target-language (type)
 */
import { z } from "zod";
import type { TargetLocale } from "./target-language";

const line = z.string().trim().min(1).max(200);
/** A paradigm: native form label → form ("Präteritum" → "er kam an"). */
const formTable = z.record(z.string().trim().min(1).max(40), line);
/** verbInfo: native sub-key → a value, a paradigm, or null where it does not apply. */
const infoTable = z.record(z.string().trim().min(1).max(40), z.union([line, formTable]).nullable());
const collocation = z.object({ text: line, vi: z.string().trim().max(200).optional() });

/**
 * Every grammar field, in the order the panel shows it. Which ones a language uses:
 *
 *   field          de fr es ko ja zh   value
 *   gender         ·  ·  ·             "m" | "f" | "n"
 *   article        ·  ·  ·             "der", "l'", "el" (nominative singular)
 *   feminine          ·  ·             adjective's feminine singular
 *   plural         ·  ·  ·             "die Bücher", "petits / petites"
 *   comparison     ·  ·  ·             "größer · am größten", "meilleur", "mejor"
 *   hAspire           ·                "h aspiré" | "h muet"
 *   counter                 ·  ·  ·    "권", "冊（さつ）", "本 běn"
 *   hanja                   ·          "學校" — the Han spelling of a Sino-Korean word
 *   traditional                   ·    "學校" — only when it differs from the simplified
 *   hanViet                 ·  ·  ·    "học hiệu" — Sino-Vietnamese reading
 *   verbInfo       ·  ·  ·  ·  ·  ·    { class, auxiliary, stem change… , paradigm }
 *   reflexive      ·  ·  ·             "sich beeilen", "se dépêcher", "quejarse"
 *   governs        ·  ·  ·  ·  ·  ·    "+ Dativ", "à + lieu", "N을/를", "Nが", "跟 + 人"
 *   serEstar             ·             Vietnamese note on ser / estar
 *   honorific               ·  ·       { "높임말": "드시다" }, { "尊敬語": "召し上がる" }
 *   reduplication                 ·    "看看", "高高兴兴"
 *   collocations   ·  ·  ·  ·  ·  ·    up to 4 { text, vi } everyday pairings
 *   tipVi          ·  ·  ·  ·  ·  ·    the single beginner trap, in Vietnamese
 */
const GRAMMAR_SHAPE = {
  gender: z.enum(["m", "f", "n"]),
  article: z.string().trim().min(1).max(8),
  feminine: line,
  plural: line,
  comparison: line,
  hAspire: z.enum(["h aspiré", "h muet"]),
  counter: line,
  hanja: line,
  traditional: line,
  hanViet: line,
  verbInfo: infoTable,
  reflexive: line,
  governs: line,
  serEstar: line,
  honorific: formTable,
  reduplication: line,
  collocations: z.array(collocation).min(1).max(4),
  tipVi: line,
} as const;

type Shape = typeof GRAMMAR_SHAPE;
export type GrammarKey = keyof Shape;
export const GRAMMAR_KEYS = Object.keys(GRAMMAR_SHAPE) as GrammarKey[];

/** The compiled form: every key optional, never null. */
export const grammarSchema = z.object(GRAMMAR_SHAPE).partial();
export type WordGrammar = z.infer<typeof grammarSchema>;

/**
 * The flat deck form, spread into the word schema. `null` (and a stray "") means "does
 * not apply", exactly as the generation rules write it.
 */
export const deckGrammarFields = Object.fromEntries(
  GRAMMAR_KEYS.map((key) => [
    key,
    z.preprocess(
      (value) => (value === "" ? null : value),
      GRAMMAR_SHAPE[key].nullable().optional(),
    ),
  ]),
) as unknown as { [K in GrammarKey]: z.ZodType<z.infer<Shape[K]> | null | undefined> };

/** Drop nulls (verbInfo's `trennbar: null`) and anything left empty by doing so. */
function prune(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (typeof value === "object") {
    const kept = Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => [key, prune(inner)] as const)
      .filter(([, inner]) => inner !== undefined);
    return kept.length ? Object.fromEntries(kept) : undefined;
  }
  return value;
}

/**
 * Gather a parsed deck word's grammar into one object.
 * @param entry - a parsed word: flat deck fields and/or an already compiled `grammar`
 * @returns The grammar with nulls dropped, or undefined when nothing applies. A flat
 *   field wins over the same key in `grammar`, so re-importing a compiled pack with a
 *   corrected flat value takes the correction.
 * @pure true
 */
export function foldGrammar(
  entry: Partial<Record<GrammarKey, unknown>> & { grammar?: WordGrammar },
): WordGrammar | undefined {
  const merged: Record<string, unknown> = { ...entry.grammar };
  for (const key of GRAMMAR_KEYS) {
    if (entry[key] !== undefined) merged[key] = entry[key];
  }
  // Rebuilt in table order, so the stored object always reads in display order.
  const ordered = Object.fromEntries(
    GRAMMAR_KEYS.map((key) => [key, prune(merged[key])]).filter(([, value]) => value !== undefined),
  );
  return Object.keys(ordered).length ? (ordered as WordGrammar) : undefined;
}

// ── Display ─────────────────────────────────────────────────────────────────────

/** Vietnamese gloss of each field, the same in every language. */
const FIELD_VI: Record<GrammarKey, string> = {
  gender: "giống",
  article: "mạo từ",
  feminine: "giống cái",
  plural: "số nhiều",
  comparison: "so sánh",
  hAspire: "âm h",
  counter: "lượng từ",
  hanja: "chữ Hán",
  traditional: "phồn thể",
  hanViet: "âm Hán Việt",
  verbInfo: "cách chia",
  reflexive: "phản thân",
  governs: "đi kèm",
  serEstar: "ser hay estar",
  honorific: "kính ngữ",
  reduplication: "lặp từ",
  collocations: "cụm hay gặp",
  tipVi: "lưu ý",
};

/** Each field's name as that language's own textbook writes it. */
const FIELD_NATIVE: Partial<Record<TargetLocale, Partial<Record<GrammarKey, string>>>> = {
  de: {
    gender: "Genus",
    plural: "Plural",
    comparison: "Steigerung",
    reflexive: "reflexiv",
    governs: "Rektion",
    collocations: "Wendungen",
    tipVi: "Achtung",
  },
  fr: {
    gender: "genre",
    feminine: "féminin",
    plural: "pluriel",
    comparison: "comparatif",
    hAspire: "h",
    reflexive: "pronominal",
    governs: "construction",
    collocations: "expressions",
    tipVi: "attention",
  },
  es: {
    gender: "género",
    feminine: "femenino",
    plural: "plural",
    comparison: "comparativo",
    reflexive: "pronominal",
    governs: "régimen",
    serEstar: "ser / estar",
    collocations: "expresiones",
    tipVi: "ojo",
  },
  ko: {
    counter: "단위 명사",
    hanja: "한자",
    governs: "문형",
    honorific: "높임말",
    collocations: "자주 쓰는 표현",
    tipVi: "주의",
  },
  ja: {
    counter: "助数詞",
    governs: "文型",
    honorific: "敬語",
    collocations: "よく使う表現",
    tipVi: "注意",
  },
  zh: {
    counter: "量词",
    traditional: "繁体",
    governs: "句型",
    reduplication: "重叠",
    collocations: "搭配",
    tipVi: "注意",
  },
  en: {
    plural: "plural",
    comparison: "comparison",
    governs: "pattern",
    collocations: "collocations",
    tipVi: "watch out",
  },
};

/**
 * Glosses for the target-language terms that appear as verbInfo / honorific keys and
 * as enumerated values. Keys and values are written by the generator in the target
 * language, so one flat table serves every deck: the terms do not collide.
 */
const TERM_VI: Record<string, string> = {
  // de
  Konjugation: "loại",
  schwach: "yếu (có quy tắc)",
  stark: "mạnh (đổi nguyên âm)",
  gemischt: "hỗn hợp",
  unregelmäßig: "bất quy tắc",
  Hilfsverb: "trợ động từ",
  trennbar: "tiền tố tách",
  Vokalwechsel: "đổi nguyên âm",
  Stammformen: "các dạng chính",
  Präsens: "hiện tại",
  Präteritum: "quá khứ đơn",
  Perfekt: "hoàn thành",
  Nominativ: "cách 1",
  Akkusativ: "cách 4",
  Dativ: "cách 3",
  Genitiv: "cách 2",
  Infinitiv: "nguyên mẫu",
  // fr
  groupe: "nhóm",
  "1er groupe": "nhóm 1",
  "2e groupe": "nhóm 2",
  "3e groupe": "nhóm 3",
  conjugaison: "loại",
  régulier: "có quy tắc",
  irrégulier: "bất quy tắc",
  auxiliaire: "trợ động từ",
  radical: "đổi gốc",
  temps: "các thì chính",
  présent: "hiện tại",
  "passé composé": "quá khứ kép",
  "futur simple": "tương lai đơn",
  "h aspiré": "h bật hơi, không nối âm",
  "h muet": "h câm, có nối âm",
  infinitif: "nguyên mẫu",
  // es
  conjugación: "loại",
  regular: "có quy tắc",
  irregular: "bất quy tắc",
  raíz: "đổi gốc",
  tiempos: "các dạng chính",
  presente: "hiện tại",
  pretérito: "quá khứ đơn",
  participio: "phân từ",
  gerundio: "tiếp diễn",
  infinitivo: "nguyên mẫu",
  // ko
  활용: "kiểu chia",
  규칙: "có quy tắc",
  "ㅂ 불규칙": "bất quy tắc ㅂ",
  "ㄷ 불규칙": "bất quy tắc ㄷ",
  "ㅅ 불규칙": "bất quy tắc ㅅ",
  "ㅎ 불규칙": "bất quy tắc ㅎ",
  "르 불규칙": "bất quy tắc 르",
  "ㄹ 탈락": "rụng ㄹ",
  "으 탈락": "rụng 으",
  활용형: "các dạng chia",
  현재: "hiện tại",
  과거: "quá khứ",
  관형형: "định ngữ",
  해요체: "lịch sự",
  반말: "thân mật",
  합쇼체: "trang trọng",
  높임말: "kính ngữ",
  // ja
  種類: "nhóm",
  五段動詞: "nhóm 1",
  一段動詞: "nhóm 2",
  カ変動詞: "nhóm 3, bất quy tắc",
  サ変動詞: "nhóm 3, đuôi する",
  い形容詞: "tính từ đuôi い",
  な形容詞: "tính từ đuôi な",
  自他: "nội / ngoại",
  自動詞: "nội động từ",
  他動詞: "ngoại động từ",
  活用形: "các thể",
  ます形: "thể lịch sự",
  て形: "thể て",
  ない形: "phủ định",
  た形: "quá khứ",
  否定: "phủ định",
  過去: "quá khứ",
  尊敬語: "tôn kính",
  謙譲語: "khiêm nhường",
  // zh
  离合词: "từ ly hợp",
};

/** Values whose head is an enumerated term: "他動詞 ↔ 開く", "e → i : er hilft". */
function termGloss(value: string): string | undefined {
  return TERM_VI[value] ?? TERM_VI[value.split(/\s+(?:↔|:)\s+/)[0]!.trim()];
}

/** Every known term named inside a construction ("jemandem (Dativ) etwas (Akkusativ)"). */
function namedTerms(value: string): string | undefined {
  const found = Object.keys(TERM_VI)
    .map((term) => ({
      term,
      at: value.search(new RegExp(`(?<![\\p{L}])${term}(?![\\p{L}])`, "u")),
    }))
    .filter(({ at }) => at !== -1)
    // In the order the construction names them: "jemandem (Dativ) etwas (Akkusativ)".
    .sort((a, b) => a.at - b.at);
  const glosses = [...new Set(found.map(({ term }) => TERM_VI[term]!))];
  return glosses.length ? glosses.join(" · ") : undefined;
}

const GENDER_VI = { m: "giống đực", f: "giống cái", n: "giống trung" } as const;

type Label = { label: string; gloss?: string };
export type GrammarForm = Label & { value: string };
export type GrammarRow = Label &
  (
    | { kind: "line"; key: string; value: string; valueGloss?: string }
    | { kind: "table"; key: string; forms: GrammarForm[] }
    | { kind: "list"; key: string; items: { text: string; vi?: string }[] }
    | { kind: "tip"; key: string; value: string }
  );

/** A field's label: the native term with the Vietnamese gloss, or the gloss alone. */
function fieldLabel(key: GrammarKey, locale: TargetLocale): Label {
  const native = FIELD_NATIVE[locale]?.[key];
  const gloss = FIELD_VI[key];
  return native ? { label: native, gloss } : { label: gloss };
}

/** A verbInfo / honorific key is already its native label. */
function termLabel(key: string): Label {
  return { label: key, gloss: TERM_VI[key] };
}

/**
 * Lay a word's grammar out as display rows, in table order.
 * @param grammar - the word's folded grammar
 * @param locale - the deck language, which picks the native field names
 * @returns One row per field; gender and article share a row, verbInfo's scalar entries
 *   become rows of their own and its paradigm a table, the trap note comes last.
 * @pure true
 */
export function grammarRows(grammar: WordGrammar, locale: TargetLocale): GrammarRow[] {
  const rows: GrammarRow[] = [];
  for (const key of GRAMMAR_KEYS) {
    const value = grammar[key];
    if (value === undefined) continue;
    switch (key) {
      case "article":
        // Shown with gender; a plural-only noun ("die Eltern") has an article and no gender.
        if (!grammar.gender)
          rows.push({ kind: "line", key, ...fieldLabel("gender", locale), value: value as string });
        break;
      case "gender": {
        const gender = value as keyof typeof GENDER_VI;
        rows.push({
          kind: "line",
          key,
          ...fieldLabel("gender", locale),
          value: grammar.article ?? gender,
          valueGloss: GENDER_VI[gender],
        });
        break;
      }
      case "verbInfo":
      case "honorific":
        for (const [term, inner] of Object.entries(value as Record<string, unknown>)) {
          if (typeof inner === "string") {
            rows.push({
              kind: "line",
              key: `${key}.${term}`,
              ...termLabel(term),
              value: inner,
              valueGloss: termGloss(inner),
            });
          } else if (inner && typeof inner === "object") {
            rows.push({
              kind: "table",
              key: `${key}.${term}`,
              ...termLabel(term),
              forms: Object.entries(inner as Record<string, string>).map(([form, text]) => ({
                ...termLabel(form),
                value: text,
              })),
            });
          }
        }
        break;
      case "collocations":
        rows.push({
          kind: "list",
          key,
          ...fieldLabel(key, locale),
          items: value as { text: string; vi?: string }[],
        });
        break;
      case "tipVi":
        rows.push({ kind: "tip", key, ...fieldLabel(key, locale), value: value as string });
        break;
      default: {
        const text = value as string;
        rows.push({
          kind: "line",
          key,
          ...fieldLabel(key, locale),
          value: text,
          valueGloss: key === "governs" ? namedTerms(text) : termGloss(text),
        });
      }
    }
  }
  return rows;
}

/**
 * What the closed section promises: the Vietnamese names of its first few rows.
 * @param rows - the section's rows
 * @returns e.g. "số nhiều · cách chia · đi kèm"
 * @pure true
 */
export function grammarHint(rows: GrammarRow[], limit = 3): string {
  const names = rows
    .filter((row) => row.kind !== "tip")
    .map((row) => {
      const field = row.key.split(".")[0] as GrammarKey;
      return FIELD_VI[field] ?? row.gloss ?? row.label;
    });
  return [...new Set(names)].slice(0, limit).join(" · ");
}
