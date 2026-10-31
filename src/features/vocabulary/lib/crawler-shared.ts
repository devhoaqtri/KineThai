/**
 * Pieces every WordCrawler batch converter needs (./crawler-ja, ./crawler-ko): a stable
 * word id and the `/…/` highlight mark.
 *
 * Exports: crawlerId, markPhrase
 * Depends on: nothing
 */

/** 32-bit FNV-1a, as hex: a short, stable fingerprint. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * A stable id: the romanization, then a fingerprint of what tells the word apart.
 * Romanization alone collides (橋 and 箸 are both hashi), and an id must never change,
 * since saved words, reactions and reports are keyed by it.
 * @param romanized The word in Latin letters
 * @param identity What makes the word distinct (its headword, or headword and sense)
 * @returns A lowercase id the schema accepts
 * @pure true
 */
export function crawlerId(romanized: string, identity: string): string {
  const slug = romanized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "w"}-${fingerprint(identity.normalize("NFC")).slice(0, 6)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mark a highlight phrase in a field where it stands as one written word: a single
 * syllable on its own, or a two-syllable word written with "_". A word the text already
 * marks inline is left alone.
 * @param text Deck text
 * @param phrase The phrase, syllables spaced ("trạng thái")
 * @returns The text with the phrase marked, or null when it is not there as one word
 * @pure true
 */
export function markPhrase(text: string, phrase: string): string | null {
  const syllables = phrase.normalize("NFC").trim().split(/\s+/);
  if (!syllables[0] || syllables.length > 2) return null;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_/])(${syllables.map(escapeRegExp).join("_")})(?![\\p{L}\\p{N}_/])`,
    "iu",
  );
  const source = text.normalize("NFC");
  return pattern.test(source) ? source.replace(pattern, "/$1/") : null;
}
