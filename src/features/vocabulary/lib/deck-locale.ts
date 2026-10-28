/**
 * The answer language of the deck on screen, for the few leaf views that name things in
 * it (the grammar section's native terms). Provided once by the feed page, which already
 * resolved it from the address; anywhere without a provider reads English.
 *
 * Exports: DeckLocaleContext
 * Depends on: react, ./target-language (type)
 */
import { createContext } from "react";
import type { TargetLocale } from "./target-language";

export const DeckLocaleContext = createContext<TargetLocale>("en");
