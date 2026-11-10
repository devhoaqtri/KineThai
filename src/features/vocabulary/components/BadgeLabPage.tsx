/**
 * /badge-lab: every look of the first-visit "Từ gì mà ..." badge side by side, each in a
 * phone frame over a real feed card, to pick the one the feed ships with.
 *
 * Development only (the route answers 404 in a production build). Tools: replay, slow
 * motion, freeze at the badge's peak (its landing and hold), a deep or pale card behind
 * it, and a "Chọn" mark per look, remembered in this browser only, to report back. The
 * frames loop on their own.
 *
 * Exports: BadgeLabPage
 * Depends on: ./DemoBadge, ../lib/badge-variants, ../lib/first-visit, ../lib/presets
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { DemoBadge } from "./DemoBadge";
import {
  BADGE_INFO,
  BADGE_VARIANTS,
  BADGE_ROTATION,
  type BadgeVariant,
} from "../lib/badge-variants";
import { DEMO_BADGE_MS, WORD_HOOK } from "../lib/first-visit";
import { THEMES, type VocabularyTheme } from "../lib/presets";
import "../vocabulary.css";
import "./badge-lab.css";

const SPEEDS = [1, 0.5, 0.25] as const;
/** Rest between loops, ms, so each replay reads as a fresh arrival. */
const REST_MS = 900;
const PICKED_KEY = "kinemedia.badge-lab.picked";
const CLUE = "Mỗi sáng sớm, ông tôi cạo mủ ở đồn điền.";

type Tone = "dark" | "light";

function firstTheme(tone: Tone): VocabularyTheme {
  return THEMES.find((theme) => theme.tone === tone) ?? THEMES[0]!;
}

function readPicked(): BadgeVariant[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PICKED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v) => BADGE_VARIANTS.includes(v)) : [];
  } catch {
    return [];
  }
}

/** One phone frame: the mock card, and the badge looping over it. */
function Frame({
  variant,
  theme,
  durationMs,
  round,
  frozen,
}: {
  variant: BadgeVariant;
  theme: VocabularyTheme;
  durationMs: number;
  round: number;
  frozen: boolean;
}) {
  return (
    <div
      className="badge-lab-phone"
      data-frozen={frozen || undefined}
      style={{ background: theme.paint, color: theme.ink } as CSSProperties}
    >
      <div className="badge-lab-chrome">
        <span>anh.chayLá</span>
        <span>vỡ lòng · A1–A2</span>
      </div>
      <p className="badge-lab-clue">{CLUE}</p>
      <div className="badge-lab-dock">
        <span style={{ background: theme.accent, color: theme.onAccent }}>Ê, từ này biết nè</span>
      </div>
      <DemoBadge key={round} text={WORD_HOOK} durationMs={durationMs} variant={variant} contained />
    </div>
  );
}

export function BadgeLabPage() {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [tone, setTone] = useState<Tone>("dark");
  const [frozen, setFrozen] = useState(false);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<BadgeVariant[]>([]);
  useEffect(() => setPicked(readPicked()), []);
  const durationMs = Math.round(DEMO_BADGE_MS / speed);
  const theme = useMemo(() => firstTheme(tone), [tone]);

  // Loop: every frame replays together, a rest after the timeline ends.
  useEffect(() => {
    if (frozen) return;
    const timer = window.setTimeout(() => setRound((r) => r + 1), durationMs + REST_MS);
    return () => window.clearTimeout(timer);
  }, [round, durationMs, frozen]);

  const togglePick = (variant: BadgeVariant) => {
    const next = picked.includes(variant)
      ? picked.filter((v) => v !== variant)
      : [...picked, variant];
    setPicked(next);
    try {
      localStorage.setItem(PICKED_KEY, JSON.stringify(next));
    } catch {
      // A lab convenience; a private window simply forgets.
    }
  };

  return (
    <main className="badge-lab">
      <header className="badge-lab-head">
        <div>
          <h1>Badge lab</h1>
          <p>
            Nền và hiệu ứng cho “{WORD_HOOK}” khi mở app lần đầu. Mọi kiểu dùng chung một nhịp (
            {DEMO_BADGE_MS} ms), nên chọn kiểu nào thẻ bên dưới vẫn bắt đầu đúng lúc. Feed xoay
            vòng, mỗi từ một kiểu:{" "}
            <strong>{BADGE_ROTATION.map((v) => BADGE_INFO[v].name).join(" → ")}</strong>.
          </p>
        </div>
        <div className="badge-lab-controls">
          <div className="badge-lab-seg" role="radiogroup" aria-label="Tốc độ">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={speed === value}
                onClick={() => {
                  setSpeed(value);
                  setRound((r) => r + 1);
                }}
              >
                {value === 1 ? "1×" : `${value}×`}
              </button>
            ))}
          </div>
          <div className="badge-lab-seg" role="radiogroup" aria-label="Thẻ phía sau">
            {(["dark", "light"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tone === value}
                onClick={() => setTone(value)}
              >
                {value === "dark" ? "Thẻ tối" : "Thẻ sáng"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="badge-lab-button"
            aria-pressed={frozen}
            onClick={() => {
              // Remount as well: a timeline that has already finished (the rest between
              // loops) ignores a new delay, so the badge would stay gone.
              setFrozen((f) => !f);
              setRound((r) => r + 1);
            }}
          >
            {frozen ? "Chạy tiếp" : "Dừng ở đỉnh"}
          </button>
          <button
            type="button"
            className="badge-lab-button"
            onClick={() => {
              setFrozen(false);
              setRound((r) => r + 1);
            }}
          >
            Phát lại
          </button>
        </div>
        {picked.length > 0 && (
          <p className="badge-lab-picked">
            Đã chọn: {picked.map((v) => BADGE_INFO[v].name).join(", ")}
          </p>
        )}
      </header>

      <section className="badge-lab-grid">
        {BADGE_VARIANTS.map((variant) => {
          const on = picked.includes(variant);
          return (
            <figure key={variant} className="badge-lab-item" data-picked={on || undefined}>
              <Frame
                variant={variant}
                theme={theme}
                durationMs={durationMs}
                round={round}
                frozen={frozen}
              />
              <figcaption>
                <div>
                  <strong>
                    {BADGE_INFO[variant].name}
                    {BADGE_ROTATION.includes(variant) && (
                      <em> · vòng xoay #{BADGE_ROTATION.indexOf(variant) + 1}</em>
                    )}
                  </strong>
                  <span>{BADGE_INFO[variant].blurb}</span>
                </div>
                <button
                  type="button"
                  className="badge-lab-pick"
                  aria-pressed={on}
                  onClick={() => togglePick(variant)}
                >
                  {on ? "✓ Đã chọn" : "Chọn"}
                </button>
              </figcaption>
            </figure>
          );
        })}
      </section>
    </main>
  );
}
