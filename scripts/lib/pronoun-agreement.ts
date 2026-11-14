/**
 * Pronoun agreement between a card's two story clues (leadVi and anticipateVi).
 *
 * The decks were written with a person's name in each clue, then the name was swapped
 * for a Vietnamese pronoun one field at a time. The two swaps did not always agree, so a
 * lead about `em` can be followed by an anticipation about `bạn ấy` or `chị`, and the
 * reader meets two people where the story has one.
 *
 * The detector reads both clues through the deck's marks (`_`/`=` joins, `|` phrase
 * edges, `/…/` highlights; digits stay digits) and finds the person-pronouns in each:
 * a pronoun syllable that is not part of a word (giật mình, cô đơn, chú ý, tiếng Anh),
 * not plural (các anh, chúng mình, 2 bạn), not a group (anh em, ông bà) and not the
 * card's own answer. A kin word (em gái, anh họ) or "a friend" (bạn thân, cô bạn) counts
 * as a person the story mentions but never as its main character.
 *
 * The lead's main character is its first pronoun in subject position (clause start, or
 * after a time frame like `xong`/`hè`), else its first pronoun. The anticipation's subject
 * is its first pronoun in subject position. A pair disagrees when that subject's pronoun
 * appears nowhere in the lead and the lead's main character appears nowhere in the
 * anticipation: the anticipation follows someone the lead never named.
 *
 * A role title (`cô giáo`, `bác bảo vệ`, `bà chủ`) is someone the story meets, so it is a
 * mention but never either clue's subject. Each mismatch is graded strong, likely or weak
 * (see MismatchGrade): how sure it is that one person was renamed twice.
 *
 * Exports: tokenizeClue, personMentions, checkPronounPair, answerSyllablesOf, PERSON_PRONOUNS, MISMATCH_GRADES
 */

export const PERSON_PRONOUNS = new Set([
  "anh", "chị", "em", "cô", "chú", "bạn", "mình", "tôi", "ông", "bà",
  "cậu", "tớ", "cháu", "bác", "dì", "thím", "mợ", "dượng", "ta",
]);

const FIRST_PERSON = new Set(["mình", "tôi", "tớ", "ta"]);
/** Pronouns of the narrator/listener pair: a switch between them can be two people. */
const DIALOGIC = new Set(["mình", "tôi", "tớ", "ta", "bạn"]);

/** Two syllables that make a word, not a person: neither syllable is a pronoun there. */
const NOT_A_PERSON = new Set(
  [
    "giật mình", "một mình", "mình mẩy", "thân mình", "chúng mình", "tụi mình", "bọn mình",
    "chú ý", "chú thích", "chú trọng", "chú tâm", "ghi chú", "chăm chú", "thần chú", "bùa chú", "chú giải",
    "cô đơn", "cô lập", "cô đọng", "cô đặc", "cô độc", "cô nhi", "cô quạnh",
    "anh hùng", "anh dũng", "tinh anh", "anh đào", "anh tài", "anh minh", "anh quốc", "anh ngữ", "anh văn", "thạch anh",
    "tiếng anh", "môn anh", "khoa anh", "chuyên anh", "nước anh", "văn anh",
    "bác bỏ", "phản bác", "uyên bác", "bác học",
    "tôi luyện", "chúng tôi", "tụi tôi", "bọn tôi",
    "người ta", "chúng ta", "ghi ta", "ta lông",
    "bà con", "đàn bà", "đàn ông", "con cháu",
    "em bé", "trẻ em", "chúng em", "tụi em", "bọn em",
    "bạn bè", "kết bạn", "làm bạn", "bè bạn",
    // groups: two people at once, never the one person a clue follows
    "anh em", "chị em", "anh chị", "ông bà", "cô dì", "cô chú", "cô cậu", "chú bác", "cô trò", "thầy cô", "chú cháu", "bà cháu", "ông cháu",
  ].map((pair) => pair),
);

/** Kin words: a relative of the story's character, a person but never the character. */
const KIN_SECOND = new Set(["gái", "trai", "họ", "ruột", "rể", "dâu", "cả", "út", "xã", "kế", "nuôi", "vợ", "chồng", "nhỏ"]);

/**
 * Role titles: `cô giáo`, `bác bảo vệ`, `bà chủ`, `chú thợ`. A titled person is someone the
 * story meets, not a renamed main character, so a title never counts as either clue's subject.
 */
const TITLE_SECOND = new Set([
  "giáo", "chủ", "cụ", "lão", "sĩ", "tài", "thợ", "bảo", "hàng", "lao", "cấp", "y", "bán", "xe", "thu",
  "công", "giao", "phục", "quản", "lễ", "hướng", "huấn", "gác", "trưởng", "hiệu", "thủ",
  "bé", "gái", "dạy", "tiếp", "kế", "đầu", "lái", "nông", "đưa", "kỹ", "phụ", "thầy",
]);

/** `chú` before an animal is the animal's classifier (chú chó, chú mèo). */
const ANIMALS = new Set(["chó", "mèo", "chim", "gà", "cún", "ếch", "sóc", "voi", "khỉ", "heo", "lợn", "bò", "ngựa", "thỏ", "cá", "gấu", "rùa", "chuột", "vịt", "hổ", "cáo", "nai", "dế", "ong", "bướm", "kiến"]);

/** Older people a young narrator meets: a new one entering the story is ordinary. */
const ELDER = new Set(["cô", "chú", "bác", "ông", "bà", "dì", "thím", "mợ", "dượng"]);

/** `bạn` + this is "a friend" (bạn thân, bạn cùng lớp), a third person. */
const FRIEND_NOUN_NEXT = new Set(["thân", "cùng", "học", "cũ", "trai", "gái", "đời", "tốt", "lớp", "đồng", "chung", "nối", "khác", "nhỏ", "hàng", "trọ", "phòng", "cạnh", "bên"]);
/** This + `bạn` is "a friend" (cô bạn, thằng bạn, người bạn), a third person. */
const FRIEND_NOUN_PREV = new Set(["cô", "cậu", "anh", "chị", "thằng", "người", "một", "đứa", "con", "nhỏ", "nhóm", "lũ", "đám", "hội", "bao", "mỗi", "từng", "vài", "mấy"]);

/** A pronoun after one of these is plural (các anh, mấy chị, mọi người). */
const PLURAL_PREV = new Set(["các", "những", "mấy", "chúng", "bọn", "tụi", "vài", "mọi", "nhiều", "hai", "hội"]);

/** Words that open a clause before its subject: `Thi xong em…`, `Hè mình…`, `Rồi chị…`. */
const FRAME_PREV = new Set([
  "xong", "rồi", "thì", "nên", "mà", "nhưng", "còn", "lúc", "khi", "sau", "trước", "hôm", "nay",
  "mới", "hè", "tết", "tuần", "năm", "tối", "khuya", "đêm", "ngày", "sáng", "chiều", "trưa", "giờ",
  "tháng", "kỳ", "lần", "liệu", "chắc", "bỗng", "dè", "ngờ", "ra", "vậy", "thế", "cuối",
]);

export type ClueSyllable = {
  /** As written, without marks or punctuation. */
  text: string;
  lower: string;
  /** Inside a `/…/` highlight. */
  marked: boolean;
  /** First syllable of a clause: start, or after `,` `.` `;` `:` `?` `!` `…` or a `|` edge. */
  clauseStart: boolean;
  /** First syllable of a sentence: start, or after `.` `?` `!`. */
  sentenceStart: boolean;
};

const LETTER = /[\p{L}\p{N}]/u;
const CLAUSE_END = /[,.;:?!…]/;
const SENTENCE_END = /[.?!]/;

/** Deck clue text → syllables, read through `_`/`=` joins, `|` edges and `/…/` marks. */
export function tokenizeClue(text: string): ClueSyllable[] {
  const out: ClueSyllable[] = [];
  let marked = false;
  let current = "";
  let currentMarked = false;
  let clauseStart = true;
  let sentenceStart = true;
  const flush = () => {
    if (!current) return;
    out.push({ text: current, lower: current.toLowerCase(), marked: currentMarked, clauseStart, sentenceStart });
    current = "";
    clauseStart = false;
    sentenceStart = false;
  };
  for (const char of text.normalize("NFC")) {
    if (LETTER.test(char)) {
      if (!current) currentMarked = marked;
      current += char;
      continue;
    }
    flush();
    if (char === "/") marked = !marked;
    else if (char === "|") clauseStart = true;
    else if (SENTENCE_END.test(char)) clauseStart = sentenceStart = true;
    else if (CLAUSE_END.test(char)) clauseStart = true;
  }
  flush();
  return out;
}

export type MentionRole = "pronoun" | "kin" | "friend" | "title";

export type PersonMention = {
  /** The pronoun syllable, lowercase: the person's key. */
  pronoun: string;
  /** How the clue wrote it: `bạn ấy`, `em gái`, `cô giáo`. */
  phrase: string;
  index: number;
  role: MentionRole;
  /** Clause-initial, or right after a time/linking frame word. */
  subject: boolean;
  /** Followed by `ấy`: a named stand-in ("that person"). */
  thirdPerson: boolean;
};

/**
 * Person-pronouns in one clue.
 * @param text Deck clue text (marks included).
 * @param answerSyllables Lowercase syllables of the card's own Vietnamese answer; a
 *   pronoun among them is the answer, not a person, and is skipped.
 */
export function personMentions(text: string, answerSyllables: ReadonlySet<string> = new Set()): PersonMention[] {
  const syllables = tokenizeClue(text);
  const mentions: PersonMention[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < syllables.length; i += 1) {
    const syllable = syllables[i]!;
    const word = syllable.lower;
    if (consumed.has(i) || !PERSON_PRONOUNS.has(word) || answerSyllables.has(word)) continue;
    const prev = syllables[i - 1];
    const next = syllables[i + 1];
    const prevLower = prev?.lower ?? "";
    const nextLower = next?.lower ?? "";
    // A capital inside a sentence is a name: Anh (England), Cô Tô, núi Bà Đen.
    if (!syllable.sentenceStart && syllable.text[0] !== word[0]) continue;
    if (NOT_A_PERSON.has(`${prevLower} ${word}`) || NOT_A_PERSON.has(`${word} ${nextLower}`)) continue;
    if (PLURAL_PREV.has(prevLower) || /^\d+$/.test(prevLower)) continue;
    if (word === "chú" && ANIMALS.has(nextLower)) continue;

    let role: MentionRole = "pronoun";
    let phrase = syllable.text;
    if (word === "bạn" && (FRIEND_NOUN_PREV.has(prevLower) || FRIEND_NOUN_NEXT.has(nextLower))) role = "friend";
    // `cô bạn`, `anh bạn`: the classifier belongs to the friend, not a person of its own.
    if (PERSON_PRONOUNS.has(word) && nextLower === "bạn" && FRIEND_NOUN_PREV.has(word)) continue;
    if (role === "pronoun" && word !== "bạn" && TITLE_SECOND.has(nextLower) && (ELDER.has(word) || word === "anh" || word === "chị" || word === "cậu")) {
      role = "title";
    }
    if (role === "pronoun" && KIN_SECOND.has(nextLower)) role = "kin";
    if (role !== "pronoun" && next) phrase = `${syllable.text} ${next.text}`;

    const thirdPerson = nextLower === "ấy";
    if (thirdPerson) {
      phrase = `${syllable.text} ấy`;
      consumed.add(i + 1);
    }
    const subject = syllable.clauseStart || (FRAME_PREV.has(prevLower) && !syllable.marked);
    mentions.push({ pronoun: word, phrase, index: i, role, subject, thirdPerson });
  }
  return mentions;
}

export type PronounMismatch = {
  grade: MismatchGrade;
  /** The lead's main character. */
  lead: PersonMention;
  /** The anticipation's subject, someone the lead never names. */
  anticipate: PersonMention;
  leadPronouns: string[];
  anticipatePronouns: string[];
};

/**
 * How sure a mismatch is.
 *  - strong: the anticipation's subject is a named stand-in (`bạn ấy`), who must be
 *    someone the lead named, or the narrator switches first person (mình ↔ tôi).
 *  - likely: two kin/peer pronouns (anh ↔ em ↔ chị…), the usual shape of a split swap.
 *  - weak: one side is the dialogue pair (bare bạn/mình/tôi), which can be "you" or a
 *    friend, or an elder (cô, bà, bác…) enters a young narrator's story: often a teacher
 *    or grandparent, a new person rather than a renamed one.
 */
export type MismatchGrade = "strong" | "likely" | "weak";

export const MISMATCH_GRADES: readonly MismatchGrade[] = ["strong", "likely", "weak"];

function gradeOf(lead: PersonMention, anticipate: PersonMention): MismatchGrade {
  if (anticipate.thirdPerson) return "strong";
  if (FIRST_PERSON.has(lead.pronoun) && FIRST_PERSON.has(anticipate.pronoun)) return "strong";
  if (DIALOGIC.has(lead.pronoun) || DIALOGIC.has(anticipate.pronoun)) return "weak";
  if (ELDER.has(anticipate.pronoun) && !ELDER.has(lead.pronoun)) return "weak";
  return "likely";
}

/** Lowercase syllables of a card's answer (`meaningVi`), for {@link personMentions}. */
export function answerSyllablesOf(meaningVi: string | undefined | null): Set<string> {
  return new Set(tokenizeClue(meaningVi ?? "").map((syllable) => syllable.lower));
}

/**
 * Compares the two story clues of one card.
 * @returns The mismatch, or null when the clues agree or there is nothing to compare.
 */
export function checkPronounPair(
  leadVi: string | undefined | null,
  anticipateVi: string | undefined | null,
  meaningVi?: string | null,
): PronounMismatch | null {
  if (!leadVi || !anticipateVi) return null;
  const answer = answerSyllablesOf(meaningVi);
  const leadMentions = personMentions(leadVi, answer);
  const antMentions = personMentions(anticipateVi, answer);
  const main = leadMentions.filter((mention) => mention.role === "pronoun");
  const lead = main.find((mention) => mention.subject) ?? main[0];
  const anticipate = antMentions.find((mention) => mention.role === "pronoun" && mention.subject);
  if (!lead || !anticipate) return null;

  const leadSet = new Set(leadMentions.map((mention) => mention.pronoun));
  const antSet = new Set(antMentions.map((mention) => mention.pronoun));
  if (leadSet.has(anticipate.pronoun) || antSet.has(lead.pronoun)) return null;

  return {
    grade: gradeOf(lead, anticipate),
    lead,
    anticipate,
    leadPronouns: leadMentions.map((mention) => mention.phrase),
    anticipatePronouns: antMentions.map((mention) => mention.phrase),
  };
}
