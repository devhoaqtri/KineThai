/**
 * One folder per difficulty level. The colour warms as levels get harder, a thicker stack
 * of paper means more pages, and the first few words show what is inside before opening it.
 *
 * Exports: LevelFolders
 * Depends on: lucide-react, word-library API types, ../../lib/word-library
 */

import { EyeOff } from "lucide-react";
import type { LibraryFolder } from "../../api/word-library.functions";
import { LIBRARY_PAGE_SIZE, NO_LEVEL } from "../../lib/word-library";

/** Hue at the easiest level, and at the hardest. */
const HUE_EASY = 155;
const HUE_HARD = 20;
const MAX_SHEETS = 3;

const tint = (index: number, count: number) => {
  const reach = count > 1 ? index / (count - 1) : 0;
  return `oklch(0.72 0.13 ${HUE_EASY + (HUE_HARD - HUE_EASY) * reach})`;
};

/**
 * @param props.folders - the language's folders, easiest first
 * @param props.onOpen - open a folder
 * @returns The folder grid
 */
export function LevelFolders({
  folders,
  onOpen,
}: {
  folders: readonly LibraryFolder[];
  onOpen: (level: string) => void;
}): React.ReactElement {
  return (
    <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder, index) => {
        const color = tint(index, folders.length);
        const pages = Math.ceil(folder.count / LIBRARY_PAGE_SIZE);
        const sheets = Math.min(MAX_SHEETS, Math.ceil(pages / 5));
        return (
          <li key={folder.level}>
            <button
              type="button"
              className="group relative block w-full pt-4 text-left outline-offset-4 transition-transform duration-150 hover:-translate-y-0.5"
              onClick={() => onOpen(folder.level)}
            >
              <span
                className="absolute left-0 top-0 h-6 w-24 rounded-tl-lg"
                style={{
                  background: color,
                  clipPath: "polygon(0 0, 82% 0, 100% 100%, 0 100%)",
                }}
                aria-hidden="true"
              />
              {Array.from({ length: sheets }, (_, sheet) => (
                <span
                  key={sheet}
                  className="absolute h-4 rounded-t-sm transition-transform duration-150 group-hover:-translate-y-0.5"
                  style={{
                    top: `${10 - sheet * 3}px`,
                    left: `${14 + sheet * 7}px`,
                    right: `${10 + sheet * 7}px`,
                    background: `color-mix(in oklab, ${color} ${45 - sheet * 12}%, var(--background))`,
                  }}
                  aria-hidden="true"
                />
              ))}
              <span
                className="relative block rounded-lg rounded-tl-none border-t-4 p-4 ring-1 ring-border"
                style={{
                  borderTopColor: color,
                  background: `color-mix(in oklab, ${color} 11%, var(--background))`,
                }}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-tight">
                    {folder.level === NO_LEVEL ? "No level" : folder.level}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {folder.count.toLocaleString()} words · {pages} page{pages === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="mt-2 block truncate text-sm text-muted-foreground">
                  {folder.samples.join(", ")}…
                </span>
                <span className="mt-3 flex min-h-5 flex-wrap items-center gap-1.5">
                  {folder.hidden > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <EyeOff size={11} aria-hidden="true" /> {folder.hidden} hidden
                    </span>
                  )}
                  {folder.open > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                      {folder.open} open
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
