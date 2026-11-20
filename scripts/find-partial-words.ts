/**
 * Find Vietnamese clues (`defVi`, `leadVi`, `anticipateVi`) that appear to have cut a
 * compound word in half (leaving a partial/stranded syllable such as `trả` from `trả_lời`).
 *
 * False positives from unjoined-but-complete compounds (e.g. `nặng trịch`, `hổn hển`,
 * `trơn tru`) are filtered out by checking whether the syllable forms an attested
 * compound or bigram (`>= 2` corpus hits) with its left or right neighbour.
 *
 * Usage:
 *   npx tsx scripts/find-partial-words.ts
 *   npx tsx scripts/find-partial-words.ts --all     # lower thresholds
 *   npx tsx scripts/find-partial-words.ts --json    # machine-readable output
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src/features/vocabulary/data");
const PACKS_DIR = join(DATA, "packs");
const CLUE_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;

const SHOW_ALL = process.argv.includes("--all");
const MEANING_ONLY = process.argv.includes("--meaning-only");
const AS_JSON = process.argv.includes("--json");

process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
});

const WRAP = /^["'“”‘’()[\]«»\-–—.,;:!?…]+|["'“”‘’()[\]«»\-–—.,;:!?…]+$/g;
const TRAILING_PUNCT = /[,.;:!?…]+$/;

interface Card {
  id?: string;
  word?: string;
  shareCode?: string;
  meaningVi?: string;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
}

function deckFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === "incoming"
        ? []
        : deckFiles(join(dir, entry.name))
      : entry.name.endsWith(".json")
        ? [join(dir, entry.name)]
        : [],
  );
}

function* vietnameseTexts(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    for (const item of value) yield* vietnameseTexts(item);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && (key.endsWith("Vi") || key === "vi")) yield item;
      else yield* vietnameseTexts(item);
    }
  }
}

function cleanSyllable(raw: string): string {
  return raw.normalize("NFC").replace(/\//g, "").replace(WRAP, "").toLowerCase();
}

interface SegToken {
  syllable: string;
  joined: boolean;
  edgeAfter: boolean;
}

function tokenizeSegments(text: string): SegToken[] {
  const out: SegToken[] = [];
  for (const chunk of text.normalize("NFC").replace(/\//g, "").split(/[\s|=]+/)) {
    if (!chunk) continue;
    const edgeAfter = TRAILING_PUNCT.test(chunk);
    const parts = chunk.split("_").map(cleanSyllable).filter(Boolean);
    const joined = parts.length >= 2;
    for (let i = 0; i < parts.length; i += 1) {
      out.push({
        syllable: parts[i]!,
        joined,
        edgeAfter: i === parts.length - 1 ? edgeAfter : false,
      });
    }
  }
  return out;
}

function joinedCompounds(text: string): string[][] {
  const out: string[][] = [];
  for (const chunk of text.normalize("NFC").replace(/\//g, "").split(/[\s|=]+/)) {
    if (!chunk.includes("_")) continue;
    const parts = chunk.split("_").map(cleanSyllable).filter(Boolean);
    if (parts.length >= 2) out.push(parts);
  }
  return out;
}

const pairKey = (a: string, b: string) => `${a}\u0001${b}`;

// 1. Build corpus-wide syllable, bigram, and compound statistics across all decks.
const joinedCount = new Map<string, number>();
const unjoinedCount = new Map<string, number>();
const bigramCount = new Map<string, number>();
const joinedPairCount = new Map<string, number>();
const topCompoundFor = new Map<string, Map<string, number>>();

for (const file of deckFiles(DATA)) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  for (const text of vietnameseTexts(parsed)) {
    const tokens = tokenizeSegments(text);
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i]!;
      const map = tok.joined ? joinedCount : unjoinedCount;
      map.set(tok.syllable, (map.get(tok.syllable) ?? 0) + 1);
      if (i + 1 < tokens.length && !tok.edgeAfter) {
        const k = pairKey(tok.syllable, tokens[i + 1]!.syllable);
        bigramCount.set(k, (bigramCount.get(k) ?? 0) + 1);
      }
    }
    for (const parts of joinedCompounds(text)) {
      const joinedStr = parts.join("_");
      for (let i = 0; i + 1 < parts.length; i += 1) {
        const k = pairKey(parts[i]!, parts[i + 1]!);
        joinedPairCount.set(k, (joinedPairCount.get(k) ?? 0) + 1);
      }
      for (const p of parts) {
        let inner = topCompoundFor.get(p);
        if (!inner) {
          inner = new Map();
          topCompoundFor.set(p, inner);
        }
        inner.set(joinedStr, (inner.get(joinedStr) ?? 0) + 1);
      }
    }
  }
}

function boundRatio(syllable: string): { ratio: number; joined: number; total: number } {
  const j = joinedCount.get(syllable) ?? 0;
  const u = unjoinedCount.get(syllable) ?? 0;
  const total = j + u;
  return { ratio: total > 0 ? j / total : 0, joined: j, total };
}

function bestCompound(syllable: string): string {
  const m = topCompoundFor.get(syllable);
  if (!m) return "";
  let best = "";
  let bestN = 0;
  for (const [comp, n] of m) {
    if (n > bestN) {
      best = comp;
      bestN = n;
    }
  }
  return best;
}

/** True if `tokens[i]` pairs naturally with its left or right neighbour in the corpus. */
function hasAttestedNeighbour(tokens: SegToken[], i: number): boolean {
  const cur = tokens[i]!.syllable;
  if (i > 0 && !tokens[i - 1]!.edgeAfter) {
    const prev = tokens[i - 1]!.syllable;
    const k = pairKey(prev, cur);
    if ((joinedPairCount.get(k) ?? 0) >= 1 || (bigramCount.get(k) ?? 0) >= 3) return true;
  }
  if (i + 1 < tokens.length && !tokens[i]!.edgeAfter) {
    const next = tokens[i + 1]!.syllable;
    const k = pairKey(cur, next);
    if ((joinedPairCount.get(k) ?? 0) >= 1 || (bigramCount.get(k) ?? 0) >= 3) return true;
  }
  return false;
}

interface Hit {
  file: string;
  word: string;
  shareCode: string;
  meaningVi: string;
  field: string;
  text: string;
  reason: string;
  syllable: string;
  boundPct: number;
  context: string;
}

const hits: Hit[] = [];
const seen = new Set<string>();

const enPackFiles = readdirSync(PACKS_DIR)
  .filter((f) => f.startsWith("en-") && f.endsWith(".json"))
  .sort()
  .map((f) => join(PACKS_DIR, f));

for (const file of enPackFiles) {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { words?: Card[] };
  const relFile = relative(ROOT, file);
  for (const card of parsed.words ?? []) {
    const meaning = card.meaningVi ?? "";
    const meaningComps = joinedCompounds(meaning);

    for (const field of CLUE_FIELDS) {
      const text = card[field];
      if (typeof text !== "string" || !text) continue;
      const tokens = tokenizeSegments(text);
      const plainSyllables = tokens.map((t) => t.syllable);

      // Signal 1: A compound in `meaningVi` lost one of its syllables, leaving the other
      // syllable unjoined and unpaired with either neighbour.
      for (const comp of meaningComps) {
        const hasFull = plainSyllables.some((_, i) =>
          comp.every((s, off) => plainSyllables[i + off] === s),
        );
        if (hasFull) continue;

        for (let i = 0; i < tokens.length; i += 1) {
          const tok = tokens[i]!;
          if (tok.joined) continue;
          if (!comp.includes(tok.syllable)) continue;
          if (!SHOW_ALL && hasAttestedNeighbour(tokens, i)) continue;
          const stats = boundRatio(tok.syllable);
          if (!SHOW_ALL && stats.ratio < 0.25) continue;
          const key = `${card.id}:${field}:${tok.syllable}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const left = i > 0 ? tokens[i - 1]!.syllable : "START";
          const right = i + 1 < tokens.length ? tokens[i + 1]!.syllable : "END";
          hits.push({
            file: relFile,
            word: card.word ?? "",
            shareCode: card.shareCode ?? "",
            meaningVi: meaning,
            field,
            text,
            reason: `cut from meaning "${comp.join("_")}"`,
            syllable: tok.syllable,
            boundPct: Math.round(stats.ratio * 100),
            context: `${left} [${tok.syllable}] ${right}`,
          });
        }
      }

      // Signal 2: An unjoined bound syllable that does not pair with either neighbour.
      if (!MEANING_ONLY) for (let i = 0; i < tokens.length; i += 1) {
        const tok = tokens[i]!;
        if (tok.joined) continue;
        const stats = boundRatio(tok.syllable);
        const minRatio = SHOW_ALL ? 0.65 : 0.8;
        if (stats.joined < 5 || stats.ratio < minRatio) continue;
        if (hasAttestedNeighbour(tokens, i)) continue;
        const key = `${card.id}:${field}:${tok.syllable}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ex = bestCompound(tok.syllable);
        const left = i > 0 ? tokens[i - 1]!.syllable : "START";
        const right = i + 1 < tokens.length ? tokens[i + 1]!.syllable : "END";
        hits.push({
          file: relFile,
          word: card.word ?? "",
          shareCode: card.shareCode ?? "",
          meaningVi: meaning,
          field,
          text,
          reason: `orphan bound syllable (${stats.joined}/${stats.total} joined, e.g. "${ex}")`,
          syllable: tok.syllable,
          boundPct: Math.round(stats.ratio * 100),
          context: `${left} [${tok.syllable}] ${right}`,
        });
      }
    }
  }
}

hits.sort((a, b) => b.boundPct - a.boundPct || a.file.localeCompare(b.file));

if (AS_JSON) {
  console.log(JSON.stringify(hits, null, 2));
} else {
  console.log(`Found ${hits.length} partial/orphan-syllable candidate(s):\n`);
  for (const h of hits) {
    console.log(
      `[${h.file}] ${h.word} (${h.shareCode}) | meaning: "${h.meaningVi}" | ${h.field}`,
    );
    console.log(`  "${h.text}"`);
    console.log(`  -> ${h.context} (${h.boundPct}% bound) — ${h.reason}\n`);
  }
}
