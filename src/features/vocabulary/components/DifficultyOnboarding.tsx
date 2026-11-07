/**
 * First-load level picker: the difficulty ladder as one draggable gauge.
 *
 * A new reader has no way to know what "đọc hiểu" or "chuyên sâu" will feel like, and the
 * toolbar's dropdown only names them. So before the first word, the whole screen is the
 * ladder: every level down the left, a rail with a knob through the middle, and — on the
 * other side of the rail — one real word from the level's own top band, so each name is
 * anchored to something concrete. The knob takes a hotter colour at every rung, so the
 * climb in intensity is visible before a single label is read.
 *
 * Exports: DifficultyOnboarding
 * Depends on: difficulty tracks, feed metadata types, vocabulary.css
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  DIFFICULTY_ALL,
  countTrackWords,
  formatLevelBand,
  isTrackAvailable,
  trackCeiling,
  tracksFor,
} from "../lib/difficulty";
import { FADE_OUT_MS, getAmbientPlayer } from "../lib/ambient";
import { pickerEntrance } from "../lib/picker-entrance";
import { getAmbientOwnership } from "../lib/ambientOwnership";
import type { TargetLocale } from "../lib/target-language";
import { difficultyCopy, t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import type { Locale } from "../lib/locale";
import type { LevelLadder } from "../lib/level-ladder";

/** BCP-47 tag for digit grouping in the active UI locale. */
function countTag(locale: Locale): string | undefined {
  switch (locale) {
    case "vi":
      return "vi-VN";
    case "th":
      return "th-TH";
    case "ja":
      return "ja-JP";
    default:
      return undefined;
  }
}

/**
 * One colour per rung, easiest to hardest: cool mint through lime and amber to red, then
 * on into magenta and violet. Ten distinct steps, so no two neighbouring levels share a hue.
 */
const RUNG_COLORS = [
  "#5eead4",
  "#6ee7a0",
  "#a3e635",
  "#fde047",
  "#fbbf24",
  "#fb923c",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
] as const;

/**
 * Nearest rung that can be chosen, searching outwards from a target.
 * @param target Rung the pointer or key asked for
 * @param available Per-rung availability
 * @returns The closest available rung, or -1 when none is
 * @pure true
 */
function nearestAvailable(target: number, available: readonly boolean[]): number {
  for (let distance = 0; distance < available.length; distance += 1) {
    if (available[target - distance]) return target - distance;
    if (available[target + distance]) return target + distance;
  }
  return -1;
}

/**
 * Full-screen level picker shown before the very first word.
 * @param props.metadata Counts, populated levels and sample words, bundled per locale
 * @param props.onPick Called with the chosen track id, or "" for every level
 * @returns The picker
 */
export function DifficultyOnboarding({
  metadata,
  locale,
  onPick,
  afterDemo = false,
  reducedMotion = false,
}: {
  metadata: LevelLadder;
  /**
   * Deck locale. Resolves which track set to render: CEFR for en/ko/ja, HSK for
   * zh. Without this the picker would hardcode CEFR and every rung would show
   * "Sắp có" on the hoa host because HSK catalogs never populate A1–C2.
   */
  locale: TargetLocale;
  onPick: (difficulty: string) => void;
  /** The reader has just watched the first-visit demo (lib/first-visit) to its end. */
  afterDemo?: boolean;
  /** The entrance is one short fade instead of a build-up. */
  reducedMotion?: boolean;
}) {
  // Picker chrome follows the UI locale; tracks and sample words follow the deck.
  const ui = useLocale();
  // Several tracks top out at the same level; each takes the NEXT sample of that level so
  // no two rungs are illustrated by the same word.
  const taken = new Map<string, number>();
  const rungs = tracksFor(locale).map((track, index) => {
    const available = isTrackAvailable(track, metadata.levels);
    // Honour sampleLevel override so vỡ lòng can show an A1 word instead of the
    // A2 business term that happens to be first in the base catalog for that level.
    const ceiling = track.sampleLevel ?? trackCeiling(track);
    const pool = (available && metadata.levelSamples[ceiling]) || [];
    const turn = taken.get(ceiling) ?? 0;
    if (pool.length) taken.set(ceiling, turn + 1);
    // Level names follow the UI locale (Japanese by default); ids still key
    // counts, samples and picks, so only the display string is overlaid.
    const copy = difficultyCopy(ui, track.id);
    return {
      track,
      label: copy.label || track.label,
      color: RUNG_COLORS[index % RUNG_COLORS.length]!,
      band: formatLevelBand(track.levels),
      available,
      count: countTrackWords([track.id], metadata.levelCounts, metadata.levels),
      // The word comes from the track's hardest level: that is the level that sets it apart
      // from the rung below, so it is the honest picture of what choosing it adds.
      sample: pool.length ? pool[turn % pool.length] : undefined,
    };
  });
  const availability = rungs.map((rung) => rung.available && rung.count > 0);
  const [picked, setPicked] = useState(0);
  // Rest on the nearest rung that is available (normally the first).
  const resolved = nearestAvailable(picked, availability);
  const index = resolved < 0 ? 0 : resolved;
  const current = rungs[index]!;
  const ladder = useRef<HTMLOListElement>(null);
  // No background music while a level is being picked: the ladder is a one-time choice,
  // not a listening session. Whatever is still sounding fades out under the entrance and is
  // then silenced; the toggle itself is left as it is, so music the reader turned on
  // resumes with the first word. A pick before the fade is done silences it at once.
  useEffect(() => {
    const player = getAmbientPlayer();
    const silence = () => {
      player.stop();
      getAmbientOwnership().release();
    };
    player.fadeOutAndHold();
    const timer = setTimeout(silence, FADE_OUT_MS);
    return () => {
      clearTimeout(timer);
      silence();
    };
  }, []);

  // The entrance (lib/picker-entrance) is fixed when the picker mounts, so nothing later can
  // restart it. Until the knob has landed no rung is lit, so the first one lights up as the
  // knob arrives; until the buttons have landed the picker takes no input, so a tap meant
  // for the demo word underneath cannot pick a level.
  const [entrance] = useState(() => pickerEntrance(afterDemo, reducedMotion));
  const [knobDown, setKnobDown] = useState(false);
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const knob = setTimeout(() => setKnobDown(true), entrance.knobMs);
    const done = setTimeout(() => setEntering(false), entrance.readyMs);
    return () => {
      clearTimeout(knob);
      clearTimeout(done);
    };
  }, [entrance]);

  // Landscape detection: drives both pointer-axis mapping in JS and a data-landscape
  // attribute that CSS uses to switch the gauge to a horizontal layout with alternating
  // sample/names that avoid collision.
  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    setLandscape(mq.matches);
    const handler = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const choose = useCallback(
    (target: number) => {
      const next = nearestAvailable(Math.max(0, Math.min(rungs.length - 1, target)), availability);
      if (next >= 0) setPicked(next);
    },
    // availability is rebuilt every render from metadata; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availability.join(), rungs.length],
  );

  /** Map a pointer's position on the ladder to the rung under it. */
  const rungAt = (clientX: number, clientY: number): number => {
    const box = ladder.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return index;
    if (landscape) return Math.floor(((clientX - box.left) / box.width) * rungs.length);
    return Math.floor(((clientY - box.top) / box.height) * rungs.length);
  };
  const dragging = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    choose(rungAt(event.clientX, event.clientY));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) choose(rungAt(event.clientX, event.clientY));
  };
  const onPointerEnd = () => {
    dragging.current = false;
  };
  /** Step to the next available rung in a direction, skipping the greyed ones. */
  const step = (direction: 1 | -1) => {
    for (let at = index + direction; at >= 0 && at < rungs.length; at += direction) {
      if (availability[at]) {
        setPicked(at);
        return;
      }
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (entering) return;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") step(-1);
    else if (event.key === "Home") choose(0);
    else if (event.key === "End") choose(rungs.length - 1);
    else if (event.key === "Enter") pick(current.track.id);
    else return;
    event.preventDefault();
  };
  const ready = resolved >= 0;
  const lit = ready && knobDown;
  /** Pick a level, but never while the picker is still building up. */
  const pick = (difficulty: string) => {
    if (!entering) onPick(difficulty);
  };

  return (
    <section
      className="vocab-onboard"
      aria-labelledby="vocab-onboard-title"
      data-landscape={landscape ? "" : undefined}
      // Only while it runs: once off, a later rotation cannot replay any of it.
      data-entrance={entering ? entrance.kind : undefined}
      style={
        {
          ...(entering ? entrance.vars : {}),
          "--rung": current.color,
          "--rung-index": index,
          "--rung-count": rungs.length,
        } as React.CSSProperties
      }
    >
      <header className="vocab-onboard-head">
        <p className="vocab-eyebrow">
          {t(ui, afterDemo ? "onboard.eyebrowAfterDemo" : "onboard.eyebrow")}
        </p>
        <h1 id="vocab-onboard-title">{t(ui, "onboard.title")}</h1>
        <p>{t(ui, "onboard.hint")}</p>
      </header>

      <div className="vocab-onboard-gauge">
        <ol className="vocab-onboard-ladder" ref={ladder}>
          {rungs.map((rung, at) => (
            <li
              key={rung.track.id}
              className="vocab-onboard-rung"
              lang={ui}
              data-on={at === index && lit ? "" : undefined}
              data-passed={at < index && lit ? "" : undefined}
              aria-disabled={!availability[at] || undefined}
              style={{ "--rung-own": rung.color, "--i": at } as React.CSSProperties}
              onClick={() => choose(at)}
            >
              <span className="vocab-onboard-name">
                <span className="vocab-onboard-label">
                  <span aria-hidden="true">{rung.track.emoji}</span> {rung.label}
                  {rung.band && <span className="vocab-onboard-band">{rung.band}</span>}
                </span>
                <span className="vocab-onboard-count">
                  {rung.count.toLocaleString(countTag(ui))}
                  <small>{t(ui, "onboard.wordsUnit")}</small>
                </span>
              </span>
              <span className="vocab-onboard-tick" aria-hidden="true" />
              <span className="vocab-onboard-sample">
                {rung.sample ? (
                  <>
                    <strong lang={locale === "zh" ? "zh-Hans" : locale}>{rung.sample.word}</strong>
                    {/* Fixed curiosity prompt: slides in with a spring when this rung
                        becomes active, fades out when the knob moves away. */}
                    <span className="vocab-onboard-curiosity">
                      {/* Two wordings, one shown: the full line needs ~180px and a
                          phone's sample column is 104–132px, so a narrow column takes
                          the short one (container query in vocabulary.css). */}
                      <span className="vocab-onboard-curiosity-long">
                        {t(ui, "onboard.curiosity")}
                      </span>
                      <span className="vocab-onboard-curiosity-short">
                        {t(ui, "onboard.curiosityShort")}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="vocab-onboard-soon">{t(ui, "onboard.soon")}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {/* The rail is one element laid over the ladder's middle column, so the knob can
            travel the whole height and a drag can start anywhere along it. */}
        <div
          className="vocab-onboard-rail"
          role="slider"
          tabIndex={0}
          aria-orientation={landscape ? "horizontal" : "vertical"}
          aria-label={t(ui, "onboard.levelAria")}
          aria-valuemin={1}
          aria-valuemax={rungs.length}
          aria-valuenow={index + 1}
          aria-valuetext={[current.label, current.band].filter(Boolean).join(", ")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        >
          <span className="vocab-onboard-knob" aria-hidden="true" />
        </div>
      </div>

      <footer className="vocab-onboard-foot">
        <button
          type="button"
          className="vocab-onboard-all"
          aria-label={t(ui, "onboard.allLevels")}
          onClick={() => pick(DIFFICULTY_ALL)}
        >
          {t(ui, "onboard.allLevels")}
        </button>
        <button
          type="button"
          className="vocab-onboard-go"
          disabled={!ready}
          onClick={() => pick(current.track.id)}
        >
          {ready ? t(ui, "onboard.start", { label: current.label }) : t(ui, "onboard.loading")}
        </button>
      </footer>
    </section>
  );
}
