/**
 * Admin LLM settings server functions (local file-backed, secret-safe).
 *
 * Manages multiple saved key profiles (Together / OpenRouter / Anthropic).
 * API keys are stored in src/features/admin/data/llm-config.json (gitignored)
 * and are NEVER returned to the client — only a masked last-4 hint.
 *
 * Exports: listLlmSettings, saveLlmProfile, deleteLlmProfile,
 * activateLlmProfile, testLlmConnection, listProviderModels
 * Depends on: llm.server, require-admin, zod
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";
import {
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  fetchProviderModels,
  llmChat,
  readLlmStore,
  writeLlmStore,
  type LlmProfile,
  type LlmProvider,
  type ProviderModel,
} from "../lib/llm.server";

const PROVIDERS = ["together", "openrouter", "anthropic"] as const;

/** Client-safe profile: key replaced by a masked hint. */
export type LlmProfileView = {
  id: string;
  label: string;
  provider: LlmProvider;
  model: string;
  keyHint: string;
};

export type LlmSettingsView = {
  profiles: LlmProfileView[];
  activeId: string | null;
  defaultModels: Record<LlmProvider, string>;
  providerLabels: Record<LlmProvider, string>;
};

function toView(p: LlmProfile): LlmProfileView {
  return {
    id: p.id,
    label: p.label,
    provider: p.provider,
    model: p.model,
    keyHint: p.apiKey ? `••••${p.apiKey.slice(-4)}` : "",
  };
}

function makeId(provider: LlmProvider, key: string, existing: LlmProfile[]): string {
  const tail = key.slice(-6).replace(/[^a-zA-Z0-9]/g, "");
  let base = `${provider}_${tail || Date.now().toString(36)}`;
  let i = 1;
  while (existing.some((p) => p.id === base)) base = `${provider}_${tail}_${i++}`;
  return base;
}

/**
 * Return all saved key profiles (masked) plus the active one.
 */
export const listLlmSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<LlmSettingsView> => {
    const store = await readLlmStore();
    return {
      profiles: store.profiles.map(toView),
      activeId: store.activeId,
      defaultModels: DEFAULT_MODELS,
      providerLabels: PROVIDER_LABELS,
    };
  });

const profileSchema = z.object({
  id: z.string().max(80).optional(),
  label: z.string().trim().min(1).max(60),
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(140),
  apiKey: z.string().trim().max(200).optional(),
  setActive: z.boolean().optional(),
});

/**
 * Create or update a key profile. An empty apiKey keeps the stored key.
 */
export const saveLlmProfile = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => profileSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });

    const store = await readLlmStore();
    const existing = data.id ? store.profiles.find((p) => p.id === data.id) : undefined;
    const apiKey = data.apiKey || existing?.apiKey;
    if (!apiKey) {
      throw new Error("An API key is required — paste one from your provider dashboard.");
    }

    let profiles: LlmProfile[];
    let newId: string;
    if (existing) {
      newId = existing.id;
      profiles = store.profiles.map((p) =>
        p.id === existing.id
          ? { ...p, label: data.label, provider: data.provider, model: data.model, apiKey }
          : p,
      );
    } else {
      newId = makeId(data.provider, apiKey, store.profiles);
      profiles = [
        ...store.profiles,
        { id: newId, label: data.label, provider: data.provider, model: data.model, apiKey },
      ];
    }

    const setActive = data.setActive ?? store.profiles.length === 0;
    await writeLlmStore({
      version: 2,
      activeId: setActive ? newId : (store.activeId ?? newId),
      profiles,
    });
    return { ok: true, id: newId };
  });

/**
 * Mark a profile as the active one used by regeneration.
 */
export const activateLlmProfile = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const store = await readLlmStore();
    if (!store.profiles.some((p) => p.id === data.id)) {
      throw new Error("Profile not found.");
    }
    await writeLlmStore({ ...store, activeId: data.id });
    return { ok: true };
  });

/**
 * Remove a saved key profile.
 */
export const deleteLlmProfile = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const store = await readLlmStore();
    const profiles = store.profiles.filter((p) => p.id !== data.id);
    const activeId = store.activeId === data.id ? (profiles[0]?.id ?? null) : store.activeId;
    await writeLlmStore({ version: 2, activeId, profiles });
    return { ok: true };
  });

/**
 * Test a profile by id (or a draft provider/key/model not yet saved).
 */
export const testLlmConnection = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().optional(),
        provider: z.enum(PROVIDERS).optional(),
        model: z.string().trim().max(140).optional(),
        apiKey: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const store = await readLlmStore();

    let cfg = { provider: data.provider, model: data.model, apiKey: data.apiKey };
    if (data.id) {
      const p = store.profiles.find((x) => x.id === data.id);
      if (!p) throw new Error("Profile not found.");
      cfg = { provider: p.provider, model: p.model, apiKey: p.apiKey };
    }
    if (!cfg.provider || !cfg.apiKey) {
      throw new Error("Choose a provider and paste an API key first.");
    }

    const started = Date.now();
    const sample = await llmChat(
      {
        provider: cfg.provider,
        model: cfg.model || DEFAULT_MODELS[cfg.provider],
        apiKey: cfg.apiKey,
      },
      {
        system: "You are a connectivity check. Reply with exactly the requested word.",
        user: "Reply with exactly: OK",
        maxTokens: 8,
        temperature: 0,
      },
    );
    return {
      ok: true,
      provider: cfg.provider,
      model: cfg.model || DEFAULT_MODELS[cfg.provider],
      sample: sample.slice(0, 60),
      latencyMs: Date.now() - started,
    };
  });

/**
 * Fetch the live model catalogue available to a provider + key so the model
 * list changes when the user switches keys. Uses the form's typed key, or a
 * saved profile's key by id.
 */
export const listProviderModels = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) =>
    z
      .object({
        provider: z.enum(PROVIDERS).optional(),
        apiKey: z.string().trim().max(200).optional(),
        id: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ProviderModel[]> => {
    await requireAdminContext({ authUserId: context.userId });
    const store = await readLlmStore();

    let provider = data.provider;
    let apiKey = data.apiKey;
    if (data.id) {
      const p = store.profiles.find((x) => x.id === data.id);
      if (!p) throw new Error("Profile not found.");
      provider = p.provider;
      apiKey = p.apiKey;
    }
    if (!provider || !apiKey) throw new Error("Provider and API key are required.");
    return fetchProviderModels({ provider, model: "", apiKey });
  });
