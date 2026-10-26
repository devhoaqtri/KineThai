import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyDemoStore,
  ensureRollup,
  readDemoTelemetry,
  utcDateKey,
  writeDemoTelemetry,
  type DemoTelemetryStore,
} from "../demo-store";
import { APP_ID, type DailyRollup } from "../../types/telemetry";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

const STORAGE_KEY = "kinetic.admin.telemetry.v1";

describe("emptyDemoStore", () => {
  it("starts with empty collections", () => {
    const store = emptyDemoStore();
    expect(store.events).toEqual([]);
    expect(store.rollups).toEqual([]);
    expect(store.errors).toEqual([]);
    expect(store.healthHistory).toEqual([]);
    expect(store.accessLog).toEqual([]);
    expect(store.activeActorsByDay).toEqual({});
  });

  it("returns a fresh object each call", () => {
    const a = emptyDemoStore();
    a.events.push({} as never);
    expect(emptyDemoStore().events).toHaveLength(0);
  });
});

describe("utcDateKey", () => {
  it("extracts the calendar day from an ISO timestamp", () => {
    expect(utcDateKey("2026-05-17T13:45:00.000Z")).toBe("2026-05-17");
  });

  it("defaults to the current UTC day", () => {
    expect(utcDateKey()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("read / write round trip", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty shape when nothing is stored", () => {
    const store = readDemoTelemetry();
    expect(store.events).toEqual([]);
    expect(store.rollups).toEqual([]);
  });

  it("reads back what was written", () => {
    const store = emptyDemoStore();
    store.events = [
      {
        id: "e1",
        app_id: APP_ID,
        event_type: "user.registered",
        occurred_at: "2026-01-01T00:00:00.000Z",
        metadata: {},
      },
    ];
    writeDemoTelemetry(store);
    expect(readDemoTelemetry().events).toHaveLength(1);
  });

  it("merges stored partials over the empty defaults", () => {
    (window.localStorage as Storage).setItem(
      STORAGE_KEY,
      JSON.stringify({ events: [{ id: "x" }] }),
    );
    const store = readDemoTelemetry();
    expect(store.events).toHaveLength(1);
    // Missing keys fall back to the empty-store shape.
    expect(store.rollups).toEqual([]);
    expect(store.activeActorsByDay).toEqual({});
  });

  it("falls back to an empty store on corrupt JSON", () => {
    (window.localStorage as Storage).setItem(STORAGE_KEY, "{not json");
    expect(readDemoTelemetry()).toEqual(emptyDemoStore());
  });

  it("persists the raw JSON under the versioned key", () => {
    const store = emptyDemoStore();
    store.errors = [
      {
        id: "err1",
        event_id: null,
        app_id: APP_ID,
        status: "new",
        message: "boom",
        severity: "error",
        actor_user_id: null,
        metadata: {},
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        resolved_by: null,
        resolved_at: null,
      },
    ];
    writeDemoTelemetry(store);
    const raw = (window.localStorage as Storage).getItem(STORAGE_KEY);
    expect(raw && JSON.parse(raw).errors).toHaveLength(1);
  });

  it("round-trips a full store without losing collections", () => {
    const store: DemoTelemetryStore = {
      ...emptyDemoStore(),
      rollups: [
        {
          app_id: APP_ID,
          date: "2026-01-01",
          new_users: 3,
          active_users: 5,
          content_created: 1,
          content_updated: 2,
          links_created: 0,
          link_interactions: 4,
          errors_total: 0,
          errors_critical: 0,
        },
      ],
      accessLog: [
        {
          id: "a1",
          actor_user_id: "u1",
          path: "/admin",
          method: "GET",
          occurred_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeActorsByDay: { "2026-01-01": ["u1", "u2"] },
    };
    writeDemoTelemetry(store);
    const read = readDemoTelemetry();
    expect(read.rollups).toHaveLength(1);
    expect(read.accessLog).toHaveLength(1);
    expect(read.activeActorsByDay["2026-01-01"]).toEqual(["u1", "u2"]);
  });
});

describe("ensureRollup", () => {
  it("appends a zeroed rollup when the date is missing", () => {
    const { rollups, row } = ensureRollup([], "2026-04-01");
    expect(rollups).toHaveLength(1);
    expect(row.date).toBe("2026-04-01");
    expect(row.app_id).toBe(APP_ID);
    expect(row.new_users).toBe(0);
    expect(row.errors_critical).toBe(0);
  });

  it("returns the existing row untouched when present", () => {
    const existing: DailyRollup = {
      app_id: APP_ID,
      date: "2026-04-01",
      new_users: 7,
      active_users: 9,
      content_created: 1,
      content_updated: 2,
      links_created: 3,
      link_interactions: 4,
      errors_total: 5,
      errors_critical: 6,
    };
    const { rollups, row } = ensureRollup([existing], "2026-04-01");
    expect(row).toBe(existing);
    expect(rollups).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const input: DailyRollup[] = [];
    ensureRollup(input, "2026-04-02");
    expect(input).toHaveLength(0);
  });

  it("adds a separate row per date", () => {
    const first = ensureRollup([], "2026-04-01");
    const second = ensureRollup(first.rollups, "2026-04-02");
    expect(second.rollups).toHaveLength(2);
    expect(second.row.date).toBe("2026-04-02");
  });

  it("ignores a row for a different app id", () => {
    const foreign: DailyRollup = {
      ...ensureRollup([], "2026-04-01").row,
      app_id: "other-app",
    };
    const { rollups, row } = ensureRollup([foreign], "2026-04-01");
    // A foreign app's row must not satisfy the lookup, so a fresh one is added.
    expect(row.app_id).toBe(APP_ID);
    expect(rollups).toHaveLength(2);
  });
});

describe("readDemoTelemetry without a window", () => {
  it("still returns a usable store shape on the server", () => {
    // No window stubbed here, and no write in this file before this point on
    // the module-memory path, so the read must degrade gracefully.
    const store = readDemoTelemetry();
    expect(Array.isArray(store.events)).toBe(true);
    expect(store).toHaveProperty("activeActorsByDay");
  });
});
