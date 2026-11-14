/**
 * Deck sentences rendered as prose. Deck text carries two authoring conventions —
 * /word/ emphasis markers and a ____ answer blank — that the kinetic stages
 * consume but that must never reach a reader as literal slashes or underscores.
 *
 * Exports: MarkedText, FilledUsage
 * Depends on: React, ../lib/stages, ../lib/usage-fill
 */
import { Fragment } from "react";
import { splitEmphasisMarkers } from "../lib/stages";
import { caseFill } from "../lib/usage-fill";

/**
 * Render a deck sentence with its /markers/ turned into highlights.
 * At most ONE mark per sentence: the first highlighted phrase gets the underline;
 * any subsequent markers are rendered as plain text, so a sentence never has
 * duplicate highlights fighting for attention.
 * @param props.text - Source field, possibly carrying /word/ markers
 * @returns Inline prose
 */
export function MarkedText({ text }: { text: string }) {
  const parts = splitEmphasisMarkers(text);
  let highlighted = false;
  return (
    <>
      {parts.map((part, index) => {
        // Only the FIRST marked run gets the highlight; the rest stay plain.
        const shouldHighlight = part.marked && !highlighted;
        if (part.marked) highlighted = true;
        return shouldHighlight ? (
          <mark key={index} className="vocab-def-mark">
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        );
      })}
    </>
  );
}

/**
 * Render an example with its answer blank filled in and the answer picked out.
 * @param props.text - Example sentence with a ____ blank
 * @param props.word - The answer that fills it
 * @returns Inline prose
 */
export function FilledUsage({ text, word }: { text: string; word: string }) {
  const runs = text.split(/_{2,}/);
  // What a reader sees before each blank, markers dropped, so a fill that opens its
  // sentence is capitalized (caseFill); the chip is inline and grows with it.
  let before = "";
  return (
    <>
      {runs.map((run, index) => {
        before += splitEmphasisMarkers(run)
          .map((part) => part.text)
          .join("");
        const fill = caseFill(before, word);
        before += fill;
        return (
          <Fragment key={index}>
            <MarkedText text={run} />
            {index < runs.length - 1 && <mark className="vocab-def-answer">{fill}</mark>}
          </Fragment>
        );
      })}
    </>
  );
}
