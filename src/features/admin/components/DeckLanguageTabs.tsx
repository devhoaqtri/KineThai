/**
 * The language switch shared by the admin's per-deck pages.
 *
 * Exports: DeckLanguageTabs
 * Depends on: target-language (type), ../lib/word-library
 */

import type { ReactNode } from "react";
import type { TargetLocale } from "@/features/vocabulary/lib/target-language";
import { LANGUAGE_LABELS } from "../lib/word-library";

/**
 * @param props.locales - the languages to offer
 * @param props.locale - the one showing
 * @param props.onPick - switch language
 * @param props.badge - what to show beside a language's name
 * @returns A row of language tabs
 */
export function DeckLanguageTabs({
  locales,
  locale,
  onPick,
  badge,
}: {
  locales: readonly TargetLocale[];
  locale: TargetLocale;
  onPick: (locale: TargetLocale) => void;
  badge: (locale: TargetLocale) => ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Language">
      {locales.map((entry) => (
        <button
          key={entry}
          type="button"
          role="tab"
          aria-selected={entry === locale}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
            entry === locale
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:bg-muted"
          }`}
          onClick={() => onPick(entry)}
        >
          {LANGUAGE_LABELS[entry]}
          {badge(entry)}
        </button>
      ))}
    </div>
  );
}
