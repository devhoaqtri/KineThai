import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../../../", import.meta.url));
const IMPORT = /^(?:import|export)\s+(?!type\b)(?:[\w$*\s{},]+?\s+from\s+)?["']([^"']+)["']/gm;

/** @param from Importing file. @param spec Import path. @returns The source file, or null for a package. */
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

/** @param entry First module. @returns Every source module its static imports reach. */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  for (const file of queue) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".json") || file.endsWith(".css")) continue;
    for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const target = resolveImport(file, spec!);
      if (target) queue.push(target);
    }
  }
  return seen;
}

describe("feed download", () => {
  // The catalog holds every deck, so a static import from the feed would put all of it on
  // the reader's first load. Reach it through a dynamic import instead.
  it("does not statically reach the catalog from the feed route", () => {
    const graph = staticGraph(join(SRC, "routes/feed/index.tsx"));
    expect(graph).toContain(join(SRC, "features/vocabulary/api/feed.ts"));
    expect(graph).not.toContain(join(SRC, "features/vocabulary/lib/catalog-source.ts"));
  });
});
