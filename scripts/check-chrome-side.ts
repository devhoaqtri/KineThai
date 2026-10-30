/**
 * Guards the horizontal chrome inset.
 *
 * --vocab-chrome-side moves everything anchored to a left or right edge inward, so a
 * platform that crops the sides of a clip does not take the title, the progress row or the
 * buttons with it. The failure it exists to prevent is partial application: one edge-
 * anchored thing left behind reads as a layout bug rather than as a missing variable, and
 * the recording is the place nobody looks until it is already posted.
 *
 * Two assertions, both on the RESULT rather than on the decision:
 *
 *   1. Every known edge-anchored rule reads the variable.
 *   2. Nothing DECLARES it anywhere in the stylesheet. It is set on :root by the recorder
 *      and inherited; a declaration on a descendant would beat that inherited value and
 *      silently pin the element back to the edge. That exact trap has already cost this
 *      file two debugging sessions (--vocab-corner, then --vocab-chrome-inset), which is
 *      why it is asserted rather than remembered.
 *
 * Run: npx tsx scripts/check-chrome-side.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The reader's sheet, then the recorded frame's own rules, which only load on the dev server.
const SHEETS = ["vocabulary.css", "vocabulary-export.css"].map((name) =>
  join(import.meta.dirname, "..", "src/features/vocabulary", name),
);
const VAR = "--vocab-chrome-side";

/** Every rule that puts something against a horizontal edge of the recorded feed. */
const MUST_READ: { selector: string; why: string }[] = [
  { selector: ".vocab-toolbar", why: "the title and the settings gear" },
  { selector: ".vocab-toolbar::before", why: "the toolbar's scrim, which must still reach the edges" },
  { selector: ".vocab-stage-band", why: "the box the text is fitted to" },
  { selector: ".vocab-progress", why: "the page progress row" },
  { selector: ".vocab-action-bar", why: "the button row underneath" },
  { selector: ".vocab-saved-dock", why: "the saved-words rail on the right edge" },
];

const css = SHEETS.map((sheet) => readFileSync(sheet, "utf8")).join("\n");
const failures: string[] = [];
let checks = 0;

/**
 * Every rule body written for a selector, not just the first.
 *
 * A selector is routinely split across rules here — one shared with a sibling for the
 * common declarations, another on its own for what differs. Reading only the first match
 * asks the wrong question ("does THIS rule set it?") instead of the one that matters
 * ("is it set for this element at all?").
 *
 * @param selector - the selector as written in the stylesheet
 * @returns the declarations of every rule naming it; empty when the selector is absent
 */
function ruleBodies(selector: string): string[] {
  // Anchored to a line start so `.vocab-progress` cannot match `.vocab-progress span`,
  // and so a selector appearing inside a longer compound one is not mistaken for it.
  const pattern = new RegExp(
    `^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(,|\\{)`,
    "gm",
  );
  const bodies: string[] = [];
  for (const match of css.matchAll(pattern)) {
    const open = css.indexOf("{", match.index);
    if (open === -1) continue;
    const close = css.indexOf("}", open);
    if (close === -1) continue;
    bodies.push(css.slice(open + 1, close));
  }
  return bodies;
}

for (const { selector, why } of MUST_READ) {
  checks += 1;
  const bodies = ruleBodies(selector);
  if (bodies.length === 0) {
    failures.push(`${selector} is gone from the stylesheet — ${why} is no longer guarded`);
    continue;
  }
  if (!bodies.some((body) => body.includes(VAR))) {
    failures.push(`${selector} does not read ${VAR}; ${why} would stay at the edge and be cropped`);
  }
}

// A declaration, not a read: `--vocab-chrome-side:` with a value, rather than var(--…).
checks += 1;
// One site is allowed: the showcase stage, which HOSTS the chrome rather than being part
// of it. Nothing on that element reads the variable, so everything inside still inherits a
// single value - the trap this check exists for is a descendant declaring it and quietly
// cutting itself off from the one above. Anywhere else is still a failure.
const SHOWCASE_HOST = ".vocab-showcase-stage";
const declarations = [...css.matchAll(new RegExp(`${VAR}\\s*:`, "g"))].filter((m) => {
  const rule = css.lastIndexOf("{", m.index);
  const selector = css.slice(Math.max(0, css.lastIndexOf("}", rule) + 1), rule);
  if (selector.includes(SHOWCASE_HOST)) return false;
  // `var(--vocab-chrome-side, 0px)` contains no colon after the name, so any colon match
  // that is not preceded by `var(` is a real declaration.
  const before = css.slice(Math.max(0, m.index - 4), m.index);
  return !before.endsWith("var(");
});
if (declarations.length) {
  failures.push(
    `${VAR} is DECLARED ${declarations.length}x in the stylesheet. It must only ever be read ` +
      `as var(${VAR}, 0px): a declaration on any element beats the value inherited from :root, ` +
      `so the recorder's inset would silently stop reaching that element.`,
  );
}

// Every read must carry the 0px fallback, or the reader-facing layout shifts the moment
// the variable is absent — which is every visit that is not a recording.
checks += 1;
const reads = [...css.matchAll(new RegExp(`var\\(${VAR}([^)]*)\\)`, "g"))];
const bare = reads.filter((m) => !m[1]!.includes(","));
if (bare.length) {
  failures.push(`${bare.length} read(s) of ${VAR} have no fallback; use var(${VAR}, 0px)`);
}
if (reads.length === 0) failures.push(`${VAR} is never read — the inset does nothing`);

// The recording flag. The recorder sets a class and the stylesheet decides what it hides;
// the failure that matters is the rule going missing while the recorder still sets the
// class, because a selector that matches nothing is silent — the drawer handle simply
// comes back in the next clip and nobody is told.
checks += 1;
const RECORDING = ".vocab-recording";
if (!css.includes(RECORDING)) {
  failures.push(
    `${RECORDING} has no rules in the stylesheet, but the recorder sets that class; ` +
      "reader-only chrome would be recorded again",
  );
} else if (!ruleBodies(`${RECORDING} .vocab-saved-dock`).some((b) => b.includes("display: none"))) {
  failures.push(
    `${RECORDING} .vocab-saved-dock no longer hides the saved-words drawer handle`,
  );
}

// The recorded title's corner must come from the export preset's safe area, not from
// numbers written here. Two sources for "where is the safe area" is how they drift apart,
// and the drift is invisible: both frames still render, they just stop agreeing.
checks += 1;
const SAFE_VARS = ["--vocab-safe-top"];
const recordedBar = ruleBodies(`${RECORDING} .vocab-toolbar`);
if (recordedBar.length === 0) {
  failures.push(`${RECORDING} .vocab-toolbar is gone; the title no longer takes the safe corner`);
} else {
  // The bar's top may read the preset's safe top directly, or through one named step
  // (--vocab-rec-top, which the text canvas also measures from so the two cannot drift).
  // What matters is that it still TRACES to the preset rather than to a number typed here.
  const tracesToSafeTop = SAFE_VARS.every((v) =>
    recordedBar.some(
      (b) =>
        b.includes(v) ||
        [...b.matchAll(/var\((--vocab-rec-[\w-]+)/g)].some((m) =>
          new RegExp(`${m[1]}\\s*:[^;]*${v}`).test(css),
        ),
    ),
  );
  if (!tracesToSafeTop) {
    failures.push(
      `${RECORDING} .vocab-toolbar's top no longer traces to ${SAFE_VARS.join(", ")}; it ` +
        "would be a number invented in the stylesheet rather than the export preset's safe area",
    );
  }
}

// ONE margin. Every edge-anchored rule in the recorded frame must resolve to the margin
// ALONE — no per-element base added to it. That addition is the whole bug this file exists
// for: with bases of 16, 20 and 24 in play, one knob meant four different margins and
// lowering it cut whichever element was shallowest, which is not something a rendered frame
// shows you until the crop lands on exactly that element.
checks += 1;
const RECORDED_EDGES = [
  `${RECORDING} .vocab-toolbar`,
  `${RECORDING} .vocab-stage-band`,
  `${RECORDING} :is(.vocab-progress, .vocab-action-bar)`,
];
// `16px + var(--…)` or `var(--…) + 20px` — a constant adjoining the margin in one value.
const BASED = /(\d+px\s*\+\s*var\(--vocab-chrome-side|var\(--vocab-chrome-side[^)]*\)\s*\+\s*\d+px)/;
for (const selector of RECORDED_EDGES) {
  const bodies = ruleBodies(selector);
  if (bodies.length === 0) {
    failures.push(`${selector} is gone; the recorded frame no longer has one margin`);
    continue;
  }
  const offender = bodies.find((b) => BASED.test(b));
  if (offender) {
    failures.push(
      `${selector} adds a constant to ${VAR}; every recorded edge must resolve to the ` +
        "margin alone, or one knob silently means several different margins again",
    );
  }
}

// Top-aligned, or the title hangs below the corner it is supposed to sit in: the row
// centres its items and the title block is shorter than the row.
checks += 1;
if (!ruleBodies(`${RECORDING} .vocab-toolbar-left`).some((b) => b.includes("align-self: start"))) {
  failures.push(
    `${RECORDING} .vocab-toolbar-left is not top-aligned; it would sit below the safe corner`,
  );
}

// The outro's markup is injected by the recorder; its styling lives here. A class the
// script writes but the stylesheet does not define produces no error anywhere - just an
// unstyled end card in a clip nobody re-watches closely. The duration is read back off the
// live scene by the recorder, so only the class names need asserting.
checks += 1;
const OUTRO_CLASSES = [
  "vocab-intro",
  "vocab-intro-veil",
  "vocab-intro-badge",
  "vocab-outro",
  "vocab-outro-veil",
  "vocab-outro-bar",
  "vocab-outro-lock",
  "vocab-outro-url",
  "vocab-outro-caret",
];
const undefinedClasses = OUTRO_CLASSES.filter((c) => !new RegExp(`\\.${c}[^\\w-]`).test(css));
if (undefinedClasses.length) {
  failures.push(
    `the outro injects ${undefinedClasses.join(", ")} but the stylesheet defines no rule ` +
      "for them; the end card would render unstyled",
  );
}
checks += 1;
for (const v of ["--outro-dur", "--intro-dur"]) {
  if (!new RegExp(`${v}\\s*:`).test(css)) {
    failures.push(`${v} is not declared; the recorder reads it to size that scene`);
  }
}

for (const line of failures) console.log(`FAIL  ${line}`);
if (!failures.length) {
  for (const { selector, why } of MUST_READ) console.log(`OK    ${selector} — ${why}`);
  console.log(`OK    ${VAR} is read ${reads.length}x, always with a fallback, declared nowhere`);
  console.log(`OK    ${RECORDING} hides the saved-words drawer handle`);
  console.log(`OK    ${RECORDING} .vocab-toolbar takes its top from the preset's safe area`);
  console.log(`OK    every recorded edge resolves to ${VAR} alone, with no base added`);
  console.log(`OK    the ${OUTRO_CLASSES.length} injected intro/outro classes are all styled`);
}

console.log(
  failures.length
    ? `\n${failures.length} of ${checks} chrome-side checks failed`
    : `\n${checks} chrome-side checks passed`,
);
process.exitCode = failures.length ? 1 : 0;
