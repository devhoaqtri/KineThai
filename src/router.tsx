import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Router base path, taken from Vite's `BASE_URL`.
 * Locally and on root-hosted deploys (Vercel) this is `/`. On sub-path hosts
 * (GitHub Pages `/<repo>/`), Vite's `base` sets `BASE_URL` so the router and
 * asset URLs agree on the prefix.
 */
const basepath = import.meta.env.BASE_URL.replace(/\/+$/, "");

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    basepath: basepath || "/",
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
