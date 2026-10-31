import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The module asks once per load, so each test gets a fresh copy. */
async function load() {
  vi.resetModules();
  return (await import("../durable-storage")).requestDurableStorage;
}

function stubStorage(persisted: boolean) {
  const storage = {
    persisted: vi.fn(async () => persisted),
    persist: vi.fn(async () => true),
  };
  vi.stubGlobal("navigator", { storage });
  return storage;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("requestDurableStorage", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("asks a browser that is not yet keeping the data", async () => {
    const storage = stubStorage(false);
    (await load())();
    await settled();
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it("does not ask again when the data is already kept", async () => {
    const storage = stubStorage(true);
    (await load())();
    await settled();
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("asks only once per page load", async () => {
    const storage = stubStorage(false);
    const request = await load();
    request();
    request();
    await settled();
    expect(storage.persisted).toHaveBeenCalledOnce();
  });

  it("does nothing where the browser has no such API", async () => {
    vi.stubGlobal("navigator", {});
    expect(() => undefined).not.toThrow();
    (await load())();
  });

  it("swallows a refusal", async () => {
    const storage = stubStorage(false);
    storage.persist.mockRejectedValueOnce(new Error("denied"));
    (await load())();
    await settled();
    expect(storage.persist).toHaveBeenCalledOnce();
  });
});
