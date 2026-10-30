/**
 * A carousel's grammar slide: the word's "Nâng cao" section as a reference card, open.
 *
 * Built only from grammarRows and the panel's own GrammarList, so a new grammar field needs
 * a gloss entry and nothing here. A long word takes two of these (splitGrammarRows). Text
 * steps down to fit what remains; a slide that still overflows at the smallest size fails
 * its fit check rather than losing a row.
 *
 * Exports: GrammarSlide
 * Depends on: ./WordGrammar, ../lib/carousel-copy, ../lib/target-language (type)
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CAROUSEL_GRAMMAR_TITLE } from "../lib/carousel-copy";
import type { GrammarRow } from "../lib/grammar";
import type { VocabularyTheme } from "../lib/presets";
import type { SafeInsets } from "../lib/export-presets";
import type { TargetLocale } from "../lib/target-language";
import { GrammarList } from "./WordGrammar";

const LARGEST_PX = 18;
const SMALLEST_PX = 13;

/**
 * @param props.word - the headword, shown above the rows
 * @param props.rows - the part of its grammar this slide shows
 * @param props.locale - the deck, for its native terms
 * @param props.theme - the card's palette, which this sits on
 * @param props.safe - the format's margins
 */
export function GrammarSlide({
  word,
  rows,
  locale,
  theme,
  safe,
}: {
  word: string;
  rows: GrammarRow[];
  locale: TargetLocale;
  theme: VocabularyTheme;
  safe: SafeInsets;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(LARGEST_PX);
  useLayoutEffect(() => {
    const node = box.current;
    if (node && node.scrollHeight > node.clientHeight && size > SMALLEST_PX) {
      setSize((current) => current - 0.5);
    }
  }, [size]);
  const style = {
    "--vocab-ink": theme.ink,
    "--vocab-accent": theme.accent,
    "--safe-top": `${safe.top * 100}%`,
    "--safe-right": `${safe.right * 100}%`,
    "--safe-bottom": `${safe.bottom * 100}%`,
    "--safe-left": `${safe.left * 100}%`,
    fontSize: size,
  } as CSSProperties;
  return (
    <div
      ref={box}
      className="carousel-grammar vocab-grammar"
      data-carousel-grammar=""
      style={style}
    >
      <h2 className="carousel-grammar-head" lang={locale}>
        <span lang="vi">{CAROUSEL_GRAMMAR_TITLE}</span>
        {word}
      </h2>
      <GrammarList rows={rows} lang={locale} />
    </div>
  );
}
