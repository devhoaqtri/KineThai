/**
 * The Chay Lá app family as a rounded panel that unfolds from the pill in
 * front of the page title and notches around it.
 *
 * A grid rather than the earlier ring: an arc only seats four or five tiles
 * before the labels collide, and the family is meant to reach ten.
 *
 * App tiles are plain anchors — sibling subdomains are separate deployments, so
 * they are full navigations. The store tile is a router Link, being our own page.
 *
 * Exports: EcosystemMenu, ECOSYSTEM_EXIT_MS
 * Depends on: router Link, ecosystem app data, usePresence, ecosystem.css
 */

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Store, X } from "lucide-react";
import { ECOSYSTEM_STORE_AVAILABLE } from "@/lib/feature-flags";
import { usePresence } from "@/hooks/use-presence";
import { ECOSYSTEM_APPS, type EcosystemApp } from "../data/apps";
import { resolveTarget } from "@/features/vocabulary/lib/target-language";
import "../ecosystem.css";

/** Matches the exit keyframes in ecosystem.css. */
export const ECOSYSTEM_EXIT_MS = 190;

/** Columns in the grid; also the row size the entry cascade is keyed to. */
const COLUMNS = 3;
/** Rows fade in together, one after the next. */
const ROW_STEP_MS = 90;
/**
 * How long the icons hold before the first row appears. The panel has to be
 * essentially in place first: tiles arriving while it is still growing made the
 * grid size itself against a container that had not settled.
 */
const ROW_LEAD_MS = 170;
/** Folding back is quicker than unfolding, and needs no lead. */
const ROW_STEP_OUT_MS = 55;

/**
 * Six squares, three by two: the app family's mark, drawn to the trigger pill's
 * own 3:2 proportions rather than lucide's square 2x2 grid. Filled, because at
 * the pill's size an outlined square is mostly stroke.
 */
function AppsGlyph(): React.ReactElement {
  return (
    <svg className="eco-trigger-glyph" viewBox="0 0 24 16" fill="currentColor" aria-hidden="true">
      {[0, 9, 18].flatMap((x) =>
        [0, 9].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1.5" />),
      )}
    </svg>
  );
}

type EcosystemMenuProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Skip the unfold stagger when the reader asked for less motion. */
  reducedMotion: boolean;
};

/**
 * Entry timing for one tile. Keyed to its ROW, not its index, so a row lands as
 * a unit and the grid reads as cascading rather than as nine separate pops.
 */
function tileStyle(index: number, rowCount: number, closing: boolean, from: string, to: string) {
  const row = Math.floor(index / COLUMNS);
  const delay = closing ? (rowCount - 1 - row) * ROW_STEP_OUT_MS : ROW_LEAD_MS + row * ROW_STEP_MS;
  return {
    "--eco-from": from,
    "--eco-to": to,
    "--eco-delay": `${delay}ms`,
  } as React.CSSProperties;
}

function AppTile({
  app,
  index,
  rowCount,
  closing,
  itemRef,
  onNavigate,
}: {
  app: EcosystemApp;
  index: number;
  rowCount: number;
  closing: boolean;
  itemRef?: React.Ref<HTMLLIElement>;
  onNavigate: () => void;
}): React.ReactElement {
  const body = (
    /* The clip layer: the flag fills the whole cell and the name rides on top of
       it in a blurred band, so the artwork has to be cropped square somewhere
       that is not the tile itself — the tile's focus ring draws outside its
       border and an overflow:hidden there would crop it. */
    <span className="eco-tile-clip">
      <span className="eco-tile-glyph" data-flag aria-hidden="true">
        {app.glyph}
      </span>
      <span className="eco-tile-name">{app.name}</span>
    </span>
  );

  return (
    <li
      className="eco-tile-slot"
      ref={itemRef}
      style={tileStyle(index, rowCount, closing, app.accent[0], app.accent[1])}
    >
      {app.status === "soon" ? (
        <span className="eco-tile" data-soon aria-disabled="true" title={app.tagline}>
          {body}
        </span>
      ) : (
        /* noreferrer as well as noopener: these are sibling subdomains, and the
           referrer would leak which word the reader was on. */
        <a
          className="eco-tile"
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          title={app.tagline}
          aria-label={`${app.name} — ${app.tagline}`}
          onClick={onNavigate}
        >
          {body}
        </a>
      )}
    </li>
  );
}

/**
 * Corner trigger plus its panel of sibling apps and the store.
 * @param props Open state, change handler and the reduced-motion preference.
 * @returns The anchored trigger and, while open, the app panel.
 */
export function EcosystemMenu({
  open,
  onOpenChange,
  reducedMotion,
}: EcosystemMenuProps): React.ReactElement {
  const presence = usePresence(open, ECOSYSTEM_EXIT_MS);
  // Everything except the host the reader is already on. The match is on the host's own
  // label, not the resolved deck locale: on localhost, a preview build or any unknown
  // address nothing matches, so the whole family — Anh included — shows. resolveTarget
  // would instead fall back to English there and wrongly hide the Anh tile.
  const apps = useMemo(() => {
    const label =
      typeof window === "undefined"
        ? ""
        : (window.location.host.trim().toLowerCase().replace(/:\d+$/, "").split(".")[0] ?? "");
    return ECOSYSTEM_APPS.filter((app) => app.id !== label);
  }, []);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLLIElement>(null);
  // The store tile — when the flag lets it show — is still a tile and shares the
  // last row with whatever apps land beside it. The footer is not: it sits under
  // the grid, outside the cascade.
  const total = apps.length + (ECOSYSTEM_STORE_AVAILABLE ? 1 : 0);
  const rowCount = Math.ceil(total / COLUMNS);
  // The grid may only become scrollable once the panel has stopped moving — a
  // scrollbar appearing mid-animation is the artefact this guards against.
  const [settled, setSettled] = useState(false);

  // The trigger is not a fixed size — vocabulary.css shrinks the pill with the
  // title at narrower widths. The notch and the growth origin are derived from
  // its measured box, because hard-coding the full-size half left the cut-out
  // several pixels off the button on every small screen.
  useEffect(() => {
    const button = trigger.current;
    const host = anchor.current;
    if (!button || !host) return;
    const sync = () => {
      host.style.setProperty("--eco-btn", `${button.offsetWidth}px`);
      host.style.setProperty("--eco-btn-h", `${button.offsetHeight}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  // Escape closes from anywhere, since focus may sit on a tile or the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      trigger.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Belt and braces for the settled flag: animationend is the fast path, this
  // is the fallback if the panel's animation never fires one.
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 600);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Move focus into the panel once it mounts, so it is reachable by keyboard.
  useEffect(() => {
    if (!open) return;
    firstItem.current?.querySelector<HTMLElement>(".eco-tile")?.focus();
  }, [open]);

  const close = () => onOpenChange(false);

  return (
    <div className="eco-anchor" ref={anchor} data-no-gesture>
      <button
        ref={trigger}
        type="button"
        className="vocab-icon-button eco-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Đóng danh sách app" : "Mở app khác trong hệ sinh thái Chay Lá"}
        data-active={open || undefined}
        onClick={() => onOpenChange(!open)}
      >
        {open ? <X size={19} /> : <AppsGlyph />}
      </button>

      {presence.mounted && (
        <>
          <div
            className="eco-scrim"
            data-closing={presence.closing || undefined}
            aria-hidden="true"
            onClick={close}
          />
          <div
            className="eco-panel"
            data-settled={(settled && !presence.closing) || undefined}
            onAnimationEnd={(event) => {
              // Only the panel's own animation, not a tile's bubbling up.
              if (event.target === event.currentTarget) setSettled(true);
            }}
            data-closing={presence.closing || undefined}
            data-still={reducedMotion || undefined}
            inert={presence.closing || undefined}
          >
            {/* Kept clear of the top-right corner, which the notch eats into. */}
            <div className="eco-panel-head">
              <p className="eco-panel-title">Ứng dụng</p>
              <p className="eco-panel-sub">Chạm để mở app khác</p>
            </div>
            <ul className="eco-panel-grid" role="menu" aria-label="Ứng dụng Chay Lá">
              {apps.map((app, index) => (
                <AppTile
                  key={app.id}
                  app={app}
                  index={index}
                  rowCount={rowCount}
                  closing={presence.closing}
                  itemRef={index === 0 ? firstItem : undefined}
                  onNavigate={close}
                />
              ))}
              {/* The store tile is ours rather than a door out to a sibling app,
                  so it is marked out from the rest — but only while the flag lets
                  it show. The old Settings fallback tile is gone: the options
                  sheet has its own permanent corner button on the toolbar, and a
                  second door to it inside this panel was one door too many. */}
              {ECOSYSTEM_STORE_AVAILABLE && (
                <li
                  className="eco-tile-slot"
                  style={tileStyle(total - 1, rowCount, presence.closing, "#6d28d9", "#3b1178")}
                >
                  <Link
                    className="eco-tile eco-tile-util"
                    to="/store"
                    role="menuitem"
                    title="Ảnh chụp màn hình và mô tả từng app"
                    aria-label="Cửa hàng — ảnh chụp màn hình và mô tả từng app"
                    onClick={close}
                  >
                    <span className="eco-tile-clip">
                      <span className="eco-tile-glyph" aria-hidden="true">
                        <Store size={19} />
                      </span>
                      <span className="eco-tile-name">Cửa hàng</span>
                    </span>
                  </Link>
                </li>
              )}
            </ul>
            {/* Under a divider rather than as a tile: the family is not done
                growing, and a row that ends in dead space reads as broken
                instead of as unannounced. */}
            <p className="eco-panel-foot">Và các ứng dụng khác — sắp ra mắt.</p>
          </div>
        </>
      )}
    </div>
  );
}
