// GitHub Pages–only build. This project is deployed as a static site, so the
// config wires TanStack Start's SPA mode directly — no Lovable wrapper, no Nitro
// server bundle. `npm run build` still produces a normal SSR build for any
// self-hosted target; the Pages workflow sets VITE_STATIC_BUILD=1 + BASE_PATH to
// emit the static SPA instead (see .github/workflows/deploy-pages.yml).
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// `true` only for the static Pages build. Set by the deploy workflow.
const staticBuild = process.env.VITE_STATIC_BUILD === "1";

// The sub-path the app is served from. GitHub Pages project sites live at
// `/<repo>/`; a local or root-hosted build uses "/". Read at build time so the
// deployed bundle points its assets (and the router) at the right base.
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  plugins: [
    tailwindcss(),
    // Resolves the `@/*` → `./src/*` alias declared in tsconfig.json.
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Preserve the import-protection policy this app was authored against: block
      // `server-only` imports and modules under a `server/` directory from the
      // client bundle, but DO NOT block every `*.server.*` file (the raw plugin's
      // default). Several modules — e.g. src/integrations/supabase/client.server.ts —
      // are named `*.server.*` yet reached from the client on purpose; their
      // createServerFn bodies are stripped into RPC stubs at build time. Providing
      // `files` here replaces the default `**/*.server.*` rule (see the plugin's
      // `pick(user, defaults)`), matching the behavior the SSR build already uses.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      ...(staticBuild
        ? {
            // Emit a single prerendered SPA shell. The shell is written to
            // `index.html` in the client output dir; every other path is served
            // the same shell by a 404.html copy of it (made by the deploy
            // workflow), so history routing resolves deep links as-is.
            // NOTE: outputPath is "/index" (no extension) — the prerenderer
            // appends ".html" to the SPA shell path, so "/index" → index.html.
            spa: {
              enabled: true,
              prerender: { enabled: true, outputPath: "/index" },
            },
          }
        : // SSR/self-hosted build: use our error-wrapping server entry.
          { server: { entry: "server" } }),
    }),
    viteReact(),
  ],
  base: basePath,
  // A static host (GitHub Pages) cannot rewrite unknown paths to the SPA shell,
  // so the deploy workflow copies the built shell to 404.html (see
  // .github/workflows/deploy-pages.yml): every deep link (e.g. /KineThai/feed)
  // boots the same shell, and the history router resolves the real pathname —
  // including ?lang= — with no hash bounce. Nothing reads VITE_STATIC_BUILD at
  // runtime; routing is history-based on every target.
});
