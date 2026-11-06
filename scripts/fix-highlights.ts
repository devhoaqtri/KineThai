/**
 * Scan every English pack clue field (defVi, leadVi, anticipateVi) for missing,
 * rejected or misplaced highlight marks, and repair them with the AI gateway.
 *
 *   bun scripts/fix-highlights.ts --scan          report only (logs/highlight-scan.json)
 *   bun scripts/fix-highlights.ts --fix [--limit N]
 *
 * A fix may only add, move or remove `/…/` and turn the space inside the new mark into
 * `_` or `=`; any other change to the sentence is rejected and the field goes to the
 * review list (logs/highlight-review.json). Rules: docs/highlight-generation-rule.md.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { classifyField, FIELDS, type Field } from "./lib/highlight-scan";

const DIR = "src/features/vocabulary/data/packs";
const args = process.argv.slice(2);
const FIX = args.includes("--fix");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

type Word = Record<string, unknown> & { id: string; word: string; meaningVi?: string };
type Job = { file: string; idx: number; w: Word; field: Field; text: string; reason: string };

const files = readdirSync(DIR).filter((f) => /^en-.*\.json$/.test(f)).sort();
const decks = new Map<string, { raw: any; words: Word[] }>();
const jobs: Job[] = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const words: Word[] = Array.isArray(raw) ? raw : raw.words;
  decks.set(f, { raw, words });
  words.forEach((w, idx) => {
    for (const field of FIELDS) {
      const text = String(w[field] ?? "");
      const reason = classifyField(text);
      if (reason !== "ok") jobs.push({ file: f, idx, w, field, text, reason });
    }
  });
}
const counts: Record<string, number> = {};
for (const j of jobs) counts[`${j.field}:${j.reason}`] = (counts[`${j.field}:${j.reason}`] ?? 0) + 1;
mkdirSync("logs", { recursive: true });
writeFileSync(
  "logs/highlight-scan.json",
  JSON.stringify({ counts, items: jobs.map(({ w, ...j }) => ({ id: w.id, ...j })) }, null, 1),
);
console.log("flagged", jobs.length, counts);
if (!FIX) process.exit(0);

const KEY = process.env.LOVABLE_API_KEY;
if (!KEY) throw new Error("LOVABLE_API_KEY missing");

const PROMPT = `You place ONE highlight mark in short Vietnamese sentences from a vocabulary game.
Rules:
- Mark exactly one real Vietnamese dictionary word of EXACTLY two syllables, written /x_y/.
- Choose the word that carries the sentence's point (the key action/object/quality), the two syllables that would survive if the sentence were cut to two.
- NEVER mark: one syllable; 3+ syllables or part of a longer word; number/quantifier + anything (mỗi_ngày, cả_lớp, một_lần); tense/degree/negation + anything (đã_xong, rất_cao, không_đúng); classifier + noun (con_mèo, cái_bàn); verb + direction/result (nhớ_ra, xem_lại); comparisons (cao_nhất); question/pointer words (lúc_nào, thế_nào, ai_đó); fillers (lần_thử, một_chút, việc_gì, thứ_gì); time phrases; names.
- When a valid word exists, do NOT change any letter, word, punctuation, "|" or other "_"/"=" in the sentence. Only remove existing /…/ slashes and add one new /x_y/. If the two chosen syllables are separated by a space, replace that space by "_" inside the mark.
- If no two-syllable word in the sentence qualifies, rewrite the sentence minimally around a real two-syllable word (Rule 4): same meaning, tone and scene, at most 2 extra syllables, keep existing "_" joins on real words, never name or delete the answer word, and mark that word. Example: "Được chưa ạ?" -> "/Chắc_chắn/ chưa ạ?". Return null only if impossible.
Input: JSON array of {k, word, meaning, s}. Output ONLY JSON: {"r":[{"k":..., "s": "<sentence>" or null}]}`;

async function ask(batch: Job[]): Promise<Map<string, string | null>> {
  const input = batch.map((j, i) => ({ k: String(i), word: j.w.word, meaning: j.w.meaningVi, s: j.text }));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-6.1-terra",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: JSON.stringify(input) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const body = await res.json();
      const out = JSON.parse(body.choices[0].message.content.replace(/^```json|```$/g, ""));
      return new Map(out.r.map((r: any) => [String(r.k), r.s ?? null]));
    } catch (e) {
      console.warn("retry", attempt, String(e).slice(0, 200));
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return new Map();
}

const syl = (s: string) => norm(s).split(" ").filter((x) => /\p{L}/u.test(x)).length;
const norm = (s: string) => s.replace(/\//g, "").replace(/[ _=]+/g, " ").trim();
const work = jobs.slice(0, LIMIT);
const review: unknown[] = [];
let fixed = 0;
const BATCH = 50;
const batches: Job[][] = [];
for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH));
let next = 0;
async function worker() {
  while (next < batches.length) {
    const b = batches[next++];
    const ans = await ask(b);
    b.forEach((j, i) => {
      const s = ans.get(String(i));
      const ok =
        typeof s === "string" &&
        syl(s) <= syl(j.text) + 2 &&
        !s.toLowerCase().includes(j.w.word.toLowerCase());
      if (ok && classifyField(s!) === "ok") {
        decks.get(j.file)!.words[j.idx][j.field] = s;
        fixed++;
      } else review.push({ id: j.w.id, word: j.w.word, field: j.field, text: j.text, reason: j.reason, got: s ?? null });
    });
    for (const [f, d] of decks) writeFileSync(join(DIR, f), JSON.stringify(d.raw, null, 2) + "\n");
    writeFileSync("logs/highlight-review.json", JSON.stringify(review, null, 1));
    console.log(`batch done, fixed ${fixed}, review ${review.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

for (const [f, d] of decks) writeFileSync(join(DIR, f), JSON.stringify(d.raw, null, 2) + "\n");
writeFileSync("logs/highlight-review.json", JSON.stringify(review, null, 1));
console.log("fixed", fixed, "review", review.length);
