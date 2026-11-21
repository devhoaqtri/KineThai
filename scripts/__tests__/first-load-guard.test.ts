import { describe, expect, it } from "vitest";
import { FIRST_LOAD_GZIP_LIMIT, isDeferredFirstLoadModule } from "../first-load-guard";

describe("first-load handoff limits", () => {
  it("caps the emitted gzip entry at 165 KB", () => {
    expect(FIRST_LOAD_GZIP_LIMIT).toBe(168960);
  });
  it("rejects account SDK modules in the entry", () => {
    expect(isDeferredFirstLoadModule("/app/node_modules/@supabase/auth-js/dist/module/index.js")).toBe(true);
    expect(isDeferredFirstLoadModule("/app/node_modules/react-dom/client.js")).toBe(false);
  });
  it("rejects old social demo data, not the reader's first-visit words", () => {
    expect(isDeferredFirstLoadModule("/app/src/features/demo/seed/posts.ts")).toBe(true);
    expect(isDeferredFirstLoadModule("/app/src/features/vocabulary/demo/en.json")).toBe(false);
  });
});