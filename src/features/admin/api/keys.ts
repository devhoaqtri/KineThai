/**
 * Admin query keys for TanStack Query.
 *
 * Exports: adminKeys
 * Depends on: none
 */

export const adminKeys = {
  all: ["admin"] as const,
  rollups: (from: string, to: string, mode: string) =>
    [...adminKeys.all, "rollups", from, to, mode] as const,
  events: (from: string, to: string, mode: string) =>
    [...adminKeys.all, "events", from, to, mode] as const,
  health: (mode: string) => [...adminKeys.all, "health", mode] as const,
  healthHistory: (mode: string) => [...adminKeys.all, "healthHistory", mode] as const,
  errors: (from: string, to: string, mode: string, status?: string) =>
    [...adminKeys.all, "errors", from, to, mode, status ?? "all"] as const,
  wordReports: () => [...adminKeys.all, "word-reports"] as const,
  library: () => [...adminKeys.all, "library"] as const,
  libraryPage: (query: string) => [...adminKeys.library(), "page", query] as const,
  libraryWord: (locale: string, id: string) =>
    [...adminKeys.library(), "word", locale, id] as const,
  workbench: (query: string) => [...adminKeys.all, "workbench", query] as const,
  workbenchViews: () => [...adminKeys.all, "workbench-views"] as const,
  templates: () => [...adminKeys.all, "templates"] as const,
  palettes: () => [...adminKeys.all, "palettes"] as const,
  llmSettings: () => [...adminKeys.all, "llm-settings"] as const,
  sessionHealth: (from: string, to: string, mode: string) =>
    [...adminKeys.all, "session-health", from, to, mode] as const,
};
