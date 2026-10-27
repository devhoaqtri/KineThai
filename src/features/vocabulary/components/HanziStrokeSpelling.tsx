/**
 * CJK post-reveal coda: draws each Han character stroke-by-stroke (笔顺) so the learner
 * watches the building blocks assemble, instead of popping whole characters the way the
 * Latin letter coda pops letters. Strokes paint in the card's accent colour over a faint
 * ink outline guide, and each character completes left-to-right.
 *
 * Hanzi Writer is imported HERE (not in lib/hanzi.ts) on purpose: the card lazy-loads this
 * module only when a Han answer reaches its coda, so the library never enters the English
 * feed chunk. The strokes themselves are per-character static files (lib/hanzi-strokes),
 * which the card has usually prefetched by the time this mounts.
 *
 * Exports: HanziStrokeSpelling
 * Depends on: hanzi-writer, ../lib/hanzi, ../lib/hanzi-strokes
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import HanziWriter from "hanzi-writer";
import type { CharacterJson } from "hanzi-writer";
import { getStrokeDrawBudgetSeconds, solveStrokeTiming } from "../lib/hanzi";
import { loadHanziStrokes } from "../lib/hanzi-strokes";

/** A single Han character; the coda renders one writer per character. */
const HAN = /\p{Script=Han}/u;

/** Resolve a card-scoped CSS custom property to a concrete rgb() via a throwaway probe. */
function resolveColor(host: HTMLElement, variable: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${variable})`;
  host.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

/** Attach an alpha channel to a computed rgb()/rgba() colour string. */
function withAlpha(rgb: string, alpha: number): string {
  const parts = rgb.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return rgb;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

/**
 * Draw the answered Han word stroke by stroke.
 * @param props.word Revealed answer (one or more Han characters).
 * @param props.reducedMotion When true, show the finished characters with no animation.
 * @returns Centred stroke-drawing overlay.
 */
export function HanziStrokeSpelling({
  word,
  reducedMotion,
}: {
  word: string;
  reducedMotion: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chars = useMemo(() => Array.from(word).filter((ch) => HAN.test(ch)), [word]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || chars.length === 0) return;
    // Copy the ref once: React may have swapped cellRefs.current by cleanup time.
    const cells = cellRefs.current;
    let cancelled = false;
    let writers: (HanziWriter | null)[] = [];
    let observer: ResizeObserver | undefined;

    const computeBox = () => {
      const gap = 10;
      const available = host.clientWidth - 32 - gap * (chars.length - 1);
      const per = Math.floor(available / chars.length);
      return Math.max(56, Math.min(200, per > 0 ? per : 160));
    };
    let box = computeBox();
    const pad = () => Math.round(box * 0.06);

    const draw = (data: CharacterJson[]) => {
      const accent = resolveColor(host, "--vocab-accent", "rgb(94, 234, 212)");
      const accentAlt = resolveColor(host, "--vocab-accent-alt", accent);
      const ink = resolveColor(host, "--vocab-ink", "rgb(255, 255, 255)");
      // The card already allotted this coda a fixed draw budget from the character count;
      // split it across the real strokes so the drawing finishes inside the page.
      const totalStrokes = data.reduce((sum, entry) => sum + entry.strokes.length, 0);
      const timing = solveStrokeTiming(totalStrokes, getStrokeDrawBudgetSeconds(word) * 1000);

      writers = chars.map((char, index) => {
        const cell = cells[index];
        if (!cell) return null;
        cell.replaceChildren();
        return HanziWriter.create(cell, char, {
          width: box,
          height: box,
          padding: pad(),
          // Already fetched above, so the writer starts on this frame, not after a request.
          charDataLoader: () => data[index],
          // The drawing process is the accent: strokes paint in it over a faint ink guide.
          strokeColor: accent,
          drawingColor: accent,
          highlightColor: accentAlt,
          outlineColor: withAlpha(ink, 0.18),
          highlightOnComplete: !reducedMotion,
          showOutline: !reducedMotion,
          showCharacter: reducedMotion,
          strokeAnimationSpeed: timing.strokeAnimationSpeed,
          delayBetweenStrokes: timing.delayBetweenStrokes,
        });
      });

      if (!reducedMotion) {
        void (async () => {
          for (let index = 0; index < writers.length; index += 1) {
            if (cancelled) return;
            const writer = writers[index];
            if (!writer) continue;
            await writer.animateCharacter();
            if (cancelled || index === writers.length - 1) return;
            // A short beat between characters so a multi-character word reads as two draws.
            await new Promise((resolve) => setTimeout(resolve, 160));
          }
        })();
      }

      observer = new ResizeObserver(() => {
        const next = computeBox();
        if (next === box) return;
        box = next;
        for (const writer of writers)
          writer?.updateDimensions({ width: box, height: box, padding: pad() });
      });
      observer.observe(host);
    };

    // A file that cannot be fetched (offline, or a deck shipped without rebuilding the
    // dataset) still shows the answer: the plain characters sit where the drawing would.
    const showPlain = () => {
      chars.forEach((char, index) => {
        const cell = cells[index];
        if (!cell) return;
        cell.textContent = char;
        cell.dataset.plain = "";
        cell.style.fontSize = `${Math.round(box * 0.8)}px`;
      });
    };

    loadHanziStrokes(word).then(
      (data) => {
        if (!cancelled) draw(data);
      },
      () => {
        if (!cancelled) showPlain();
      },
    );

    return () => {
      cancelled = true;
      observer?.disconnect();
      // Stop the tweens too: emptying the cell detaches the SVG but would leave each
      // writer's animation frames running to the end of its strokes.
      for (const writer of writers) void writer?.pauseAnimation();
      for (const cell of cells) {
        cell?.replaceChildren();
        if (cell) {
          delete cell.dataset.plain;
          cell.style.fontSize = "";
        }
      }
    };
    // chars derives from word; box is measured imperatively, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, reducedMotion]);

  return (
    <div className="vocab-stroke" ref={hostRef} aria-hidden="true">
      <p className="vocab-spelling-label">Viết lại từng nét</p>
      <p className="sr-only" lang="zh">
        {word}
      </p>
      <div className="vocab-stroke-row" lang="zh">
        {chars.map((char, index) => (
          <div
            key={`${char}-${index}`}
            className="vocab-stroke-char"
            ref={(element) => {
              cellRefs.current[index] = element;
            }}
          />
        ))}
      </div>
    </div>
  );
}
