/**
 * Fails the build when something that must never ship reaches a bundle.
 *
 * Word decks: they are served a page at a time behind a signed cursor and rate limits, and
 * all of that is moot once a client module imports lib/catalog-source or a deck JSON: the
 * bundler copies the whole deck into a public asset. That has now happened twice, the
 * second time through the memory sheet, and both times the build stayed green because
 * scripts/check-deck-not-bundled.ts only runs when someone remembers to.
 *
 * Export tools: Export Studio, the recorder's frames and the post recorder run on the
 * admin's own machine and are held back by `import.meta.env.DEV`. One stray static import
 * would put them on the hosted site without anything failing, so the same check covers them.
 *
 * So this lives in the build itself. It reads the modules actually rendered into each
 * chunk, which needs no output folder or extra tool, so it holds wherever `vite build`
 * runs. The deck script stays as the slower, deeper check: it fingerprints the built
 * assets, so it also catches deck text pasted into source.
 *
 * Exports: isDeckModule, isExportModule, hasExportStyles, deckGuard
 * Depends on: vite (types only)
 */
import type { Plugin } from "vite";

const DECK_MODULE =
  /\/features\/vocabulary\/(lib\/catalog-source\.ts|data\/(catalog\.json|(packs|zh|ko|ja|fr|de|es)\/[^/]+\.json))/;

const EXPORT_MODULE = new RegExp(
  "/features/(" +
    [
      "vocabulary/components/(ExportStudio|ExportGuides|ExportFramePage|ShowcasePage|ShowcaseChrome|TikTokLabPage|CarouselFramePage|CarouselChrome|CarouselStudio|GrammarSlide)\\.tsx",
      "vocabulary/lib/(export-recorder|export-presets|export-contract|showcase-contract|carousel|carousel-contract|carousel-copy|carousel-formats|slide-settle)\\.ts",
      "vocabulary/vocabulary-export\\.css",
      "vocabulary/api/carousel-render\\.server\\.ts",
      "post-player/hooks/usePostExport\\.ts",
      "post-player/lib/export-video\\.ts",
    ].join("|") +
    ")",
);

/** Rules only vocabulary-export.css writes. A CSS file loses its module ids once bundled. */
const EXPORT_STYLE = /\.vocab-(export-record|outro-bar|intro-badge)\b/;

/** A bundler module id with its query dropped and its slashes made forward. */
function modulePath(id: string): string {
  return id.split("?")[0]!.replaceAll("\\", "/");
}

/**
 * @param id - A bundler module id, possibly carrying a query
 * @returns Whether the module is a deck, or the loader that imports every deck
 * @pure true
 */
export function isDeckModule(id: string): boolean {
  return DECK_MODULE.test(modulePath(id));
}

/**
 * @param id - A bundler module id, possibly carrying a query
 * @returns Whether the module belongs to the local-only export tools
 * @pure true
 */
export function isExportModule(id: string): boolean {
  return EXPORT_MODULE.test(modulePath(id));
}

/**
 * @param css - The text of a built stylesheet
 * @returns Whether the export tools' rules are in it
 * @pure true
 */
export function hasExportStyles(css: string): boolean {
  return EXPORT_STYLE.test(css);
}

/** @returns A build-only plugin that stops the build on a bundled deck or export tool. */
export function deckGuard(): Plugin {
  return {
    name: "deck-guard",
    apply: "build",
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      const carried = (matches: (id: string) => boolean) =>
        outputs.flatMap((output) =>
          output.type === "chunk"
            ? Object.entries(output.modules)
                .filter(([id, module]) => module.renderedLength > 0 && matches(id))
                .map(([id]) => `  ${output.fileName} carries ${id.replace(process.cwd(), ".")}`)
            : [],
        );

      const exportLeaks = [
        ...carried(isExportModule),
        ...outputs.flatMap((output) =>
          output.type === "asset" &&
          output.fileName.endsWith(".css") &&
          hasExportStyles(String(output.source))
            ? [`  ${output.fileName} carries vocabulary-export.css`]
            : [],
        ),
      ];
      if (exportLeaks.length) {
        this.error(
          `A local-only export tool reached a production bundle:\n${exportLeaks.join("\n")}\n` +
            "Import it only behind import.meta.env.DEV. Export never runs on the hosted site.",
        );
      }

      // The server build is meant to carry the decks.
      if (this.environment.name !== "client") return;
      const deckLeaks = carried(isDeckModule);
      if (deckLeaks.length) {
        this.error(
          `A word deck reached the client bundle:\n${deckLeaks.join("\n")}\n` +
            "Only *.server.ts code may reach lib/catalog-source. Decks must never ship to browsers.",
        );
      }
    },
  };
}
