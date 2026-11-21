import { describe, expect, it } from "vitest";
import { storedIdForDay } from "../session-tracker";

describe("storedIdForDay", () => {
  const id = "6f1c2b0a-9e2d-4b7a-8c3e-2a1d4f5e6b7c";

  it("keeps an ID through the day it was made", () => {
    expect(storedIdForDay(`${id}|2026-11-21`, "2026-11-21")).toBe(id);
  });

  it("drops it on the next day, so days are never linked", () => {
    expect(storedIdForDay(`${id}|2026-11-21`, "2026-11-22")).toBeNull();
  });

  it("drops an ID stored before IDs were day-bound, and nothing at all", () => {
    expect(storedIdForDay(id, "2026-11-21")).toBeNull();
    expect(storedIdForDay(null, "2026-11-21")).toBeNull();
  });
});
