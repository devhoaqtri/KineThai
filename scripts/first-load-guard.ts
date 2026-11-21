import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

export const FIRST_LOAD_GZIP_LIMIT = 165 * 1024;

export function isDeferredFirstLoadModule(id: string): boolean {
  const path = id.replaceAll("\\", "/");
  return /\/node_modules\/@supabase\//.test(path) || /\/src\/features\/demo\//.test(path);
}

/** Check the actual emitted entry, not source sizes or estimates. */
export function firstLoadGuard(): Plugin {
  return {
    name: "first-load-guard",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const entry = Object.values(bundle)
        .filter((output) => output.type === "chunk" && /(?:^|\/)index-[^/]+\.js$/.test(output.fileName))
        .sort((a, b) => (b.type === "chunk" ? b.code.length : 0) - (a.type === "chunk" ? a.code.length : 0))[0];
      if (!entry || entry.type !== "chunk") this.error("First-load entry not found.");
      const gzipBytes = gzipSync(entry.code).length;
      const leaks = Object.entries(entry.modules)
        .filter(([id, module]) => module.renderedLength > 0 && isDeferredFirstLoadModule(id))
        .map(([id]) => id);
      console.info(`[first-load] ${entry.fileName}: ${Buffer.byteLength(entry.code)} raw bytes, ${gzipBytes} gzip bytes`);
      if (leaks.length) this.error(`Deferred modules reached the first load:\n${leaks.join("\n")}`);
      if (gzipBytes > FIRST_LOAD_GZIP_LIMIT) {
        this.error(`First-load gzip is ${gzipBytes} bytes; limit is ${FIRST_LOAD_GZIP_LIMIT} (165 KB).`);
      }
    },
  };
}