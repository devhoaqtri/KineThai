/**
 * Fails the build when a word deck reaches the browser bundle.
 *
 * The decks are served a page at a time behind a signed cursor and rate limits, and all
 * of that is moot once a client module imports lib/catalog-source or a deck JSON: the
 * bundler copies the whole deck into a public asset. That has now happened twice, the
 * second time through the memory sheet, and both times the build stayed green because
 * scripts/check-deck-not-bundled.ts only runs when someone remembers to.
 *
 * So this lives in the build itself. It reads the modules actually rendered into each
 * client chunk, which needs no output folder or extra tool, so it holds wherever
 * `vite build` runs. The script stays as the slower, deeper check: it fingerprints the
 * built assets, so it also catches deck text pasted into source.
 *
 * Exports: isDeckModule, deckGuard
 * Depends on: vite (types only)
 */
import type { Plugin } from "vite";

const DECK_MODULE =
  /\/features\/vocabulary\/(lib\/catalog-source\.ts|data\/(catalog\.json|(packs|zh|ko|ja|fr|de|es)\/[^/]+\.json))/;

/**
 * @param id - A bundler module id, possibly carrying a query
 * @returns Whether the module is a deck, or the loader that imports every deck
 * @pure true
 */
export function isDeckModule(id: string): boolean {
  return DECK_MODULE.test(id.split("?")[0]!.replaceAll("\\", "/"));
}

/** @returns A build-only plugin that stops the client build on a bundled deck. */
export function deckGuard(): Plugin {
  return {
    name: "deck-guard",
    apply: "build",
    generateBundle(_options, bundle) {
      // The server build is meant to carry the decks.
      if (this.environment.name !== "client") return;
      const leaks = Object.values(bundle).flatMap((output) =>
        output.type === "chunk"
          ? Object.entries(output.modules)
              .filter(([id, module]) => module.renderedLength > 0 && isDeckModule(id))
              .map(([id]) => `  ${output.fileName} carries ${id.replace(process.cwd(), ".")}`)
          : [],
      );
      if (leaks.length) {
        this.error(
          `A word deck reached the client bundle:\n${leaks.join("\n")}\n` +
            "Only *.server.ts code may reach lib/catalog-source. Decks must never ship to browsers.",
        );
      }
    },
  };
}
