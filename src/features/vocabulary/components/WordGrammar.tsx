/**
 * The meaning panel's "Nâng cao" section: a word's grammar in its own language —
 * gender and plural, conjugation class and principal forms, the case or particle it
 * governs, counters, honorifics, the Sino-Vietnamese reading, everyday pairings, and the
 * one trap a beginner falls into.
 *
 * Closed by default, it is one quiet row at the foot of the panel naming what it holds.
 * Opening it by hand holds the card on its answer until it is closed again: autoplay
 * would otherwise move on mid-table. That is for this word only. A reader who wants
 * grammar on every word turns on "Luôn mở Nâng cao" in Settings (lib/grammar-expand),
 * which opens it without holding anything and gives the answer twice the time instead.
 *
 * Exports: WordGrammar, GrammarList
 * Depends on: framer-motion, lucide-react, ../lib/grammar, ../lib/deck-locale,
 *   ../lib/word-joiner, ../lib/ui-copy, ../lib/useLocale, vocabulary.css (.vocab-grammar*)
 */
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { DeckLocaleContext } from "../lib/deck-locale";
import {
  grammarHint,
  grammarRows,
  type GrammarRow,
  type WordGrammar as Grammar,
} from "../lib/grammar";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { encodeWordJoiners } from "../lib/word-joiner";

/** Fields whose value is written in Vietnamese, not the target language. */
const VIETNAMESE_VALUES = new Set(["serEstar", "hanViet"]);

function Label({
  row,
  lang,
  uiLang,
}: {
  row: Pick<GrammarRow, "label" | "gloss">;
  lang: string;
  uiLang: string;
}) {
  return (
    <>
      <span lang={lang}>{row.label}</span>
      {row.gloss && <small lang={uiLang}>{row.gloss}</small>}
    </>
  );
}

function Row({ row, lang, uiLang }: { row: GrammarRow; lang: string; uiLang: string }) {
  if (row.kind === "tip") {
    return (
      <div className="vocab-grammar-tip">
        <p className="vocab-grammar-tip-label">
          <Label row={row} lang={lang} uiLang={uiLang} />
        </p>
        {/* Imported packs skip the catalog's load-time join pass, so the note is
            encoded here too; encoding is idempotent. */}
        <p lang="vi">{encodeWordJoiners(row.value)}</p>
      </div>
    );
  }
  return (
    <div className="vocab-grammar-row" data-kind={row.kind}>
      <dt>
        <Label row={row} lang={lang} uiLang={uiLang} />
      </dt>
      <dd>
        {row.kind === "line" && (
          <>
            <span lang={VIETNAMESE_VALUES.has(row.key) ? "vi" : lang}>
              {VIETNAMESE_VALUES.has(row.key) ? encodeWordJoiners(row.value) : row.value}
            </span>
            {row.valueGloss && <small lang={uiLang}>{row.valueGloss}</small>}
          </>
        )}
        {row.kind === "table" && (
          <table className="vocab-grammar-forms">
            <tbody>
              {row.forms.map((form) => (
                <tr key={form.label}>
                  <th scope="row">
                    <Label row={form} lang={lang} uiLang={uiLang} />
                  </th>
                  <td lang={lang}>{form.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {row.kind === "list" && (
          <ul className="vocab-grammar-pairs">
            {row.items.map((item) => (
              <li key={item.text}>
                <span lang={lang}>{item.text}</span>
                {item.vi && <small lang="vi">{encodeWordJoiners(item.vi)}</small>}
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

/**
 * The rows themselves, shared with a carousel's grammar slide.
 * @param props.rows - from grammarRows
 * @param props.lang - the deck's language, for its native terms
 * @param props.uiLang - the reader's UI language
 */
export function GrammarList({
  rows,
  lang,
  uiLang,
}: {
  rows: GrammarRow[];
  lang: string;
  uiLang?: string;
}) {
  return (
    <dl className="vocab-grammar-list">
      {rows.map((row) => (
        <Row key={row.key} row={row} lang={lang} uiLang={uiLang ?? "vi"} />
      ))}
    </dl>
  );
}

/**
 * @param props.grammar - the word's folded grammar
 * @param props.expanded - start open, from the reader's Settings choice
 * @param props.reducedMotion - open and close without the height spring
 * @param props.onHold - true when the reader opens the section by hand, false when it
 *   closes or leaves the screen; the card pauses its autoplay in between
 */
export function WordGrammar({
  grammar,
  expanded,
  reducedMotion,
  onHold,
}: {
  grammar: Grammar;
  expanded: boolean;
  reducedMotion: boolean;
  onHold?: (held: boolean) => void;
}) {
  const ui = useLocale();
  const locale = useContext(DeckLocaleContext);
  const rows = useMemo(() => grammarRows(grammar, locale, ui), [grammar, locale, ui]);
  const [open, setOpen] = useState(expanded);
  const bodyId = useId();
  const section = useRef<HTMLElement>(null);
  // Only a hand-opened section holds the card: one that opened itself from the
  // Settings choice must not stop a stream the reader left playing.
  const held = useRef(false);
  const release = useRef(onHold);
  release.current = onHold;
  useEffect(
    () => () => {
      if (held.current) release.current?.(false);
    },
    [],
  );
  if (!rows.length) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next !== held.current) {
      held.current = next;
      onHold?.(next);
    }
  };
  // Bring the opened rows into the panel's own scroller. Not scrollIntoView: that also
  // scrolls every ancestor, and one of them is the snapping word stream.
  const reveal = () => {
    const node = section.current;
    const scroller = node?.closest<HTMLElement>(".vocab-reveal-scroll");
    if (!node || !scroller) return;
    const overflow = node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (overflow <= 0) return;
    const toTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollBy({
      top: Math.min(overflow, toTop),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <section className="vocab-grammar" data-open={open || undefined} ref={section}>
      <button
        type="button"
        className="vocab-grammar-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <span className="vocab-grammar-title">{t(ui, "grammar.title")}</span>
        <span className="vocab-grammar-hint" lang={ui}>
          {grammarHint(rows, 3, ui)}
        </span>
        <ChevronDown className="vocab-grammar-chevron" size={16} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            id={bodyId}
            className="vocab-grammar-body"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={
              reducedMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { height: 0, opacity: 0 }
            }
            transition={{ height: SPRING.gentle, opacity: { duration: 0.2 } }}
            onAnimationComplete={() => open && reveal()}
          >
            <GrammarList rows={rows} lang={locale} uiLang={ui} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
