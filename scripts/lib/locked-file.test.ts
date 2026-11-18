import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { updateJsonFile, withFileLock } from "./locked-file";

const fresh = () => mkdtempSync(join(tmpdir(), "locked-file-"));
const readCount = (file: string) => () => JSON.parse(readFileSync(file, "utf8")) as { n: number };
const writeCount = (value: { n: number }) => `${JSON.stringify(value)}\n`;

describe("updateJsonFile", () => {
  it("applies the change to the file as it is now, not to an earlier copy", () => {
    const file = join(fresh(), "calendar.json");
    writeFileSync(file, writeCount({ n: 1 }));
    const early = readCount(file)(); // a writer that read long ago
    updateJsonFile(file, readCount(file), writeCount, (v) => {
      v.n += 10; // another writer's change in between
    });
    updateJsonFile(file, readCount(file), writeCount, (v) => {
      v.n += early.n; // the first writer adds its part to what is there now
    });
    expect(readCount(file)().n).toBe(12);
  });

  it("writes nothing when the change returns false, and releases the lock", () => {
    const file = join(fresh(), "calendar.json");
    writeFileSync(file, writeCount({ n: 1 }));
    updateJsonFile(file, readCount(file), writeCount, (v) => {
      v.n = 99;
      return false;
    });
    expect(readCount(file)().n).toBe(1);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("loses no change when several processes write at once", async () => {
    const file = join(fresh(), "calendar.json");
    writeFileSync(file, writeCount({ n: 0 }));
    const lib = resolve(__dirname, "locked-file.ts");
    const child = `
      const { updateJsonFile } = await import(${JSON.stringify(lib)});
      const fs = await import("node:fs");
      const file = ${JSON.stringify(file)};
      for (let i = 0; i < 40; i++) {
        updateJsonFile(file, () => JSON.parse(fs.readFileSync(file, "utf8")), (v) => JSON.stringify(v), (v) => { v.n += 1; });
      }`;
    const run = () =>
      new Promise<number>((done) =>
        spawn(
          process.execPath,
          ["--experimental-strip-types", "--input-type=module", "-e", child],
          { stdio: "inherit" },
        ).on("exit", (code) => done(code ?? 1)),
      );
    const codes = await Promise.all([run(), run(), run(), run()]);
    expect(codes).toEqual([0, 0, 0, 0]);
    expect(readCount(file)().n).toBe(160);
  }, 30_000);
});

describe("withFileLock", () => {
  it("breaks a lock whose owner has died", () => {
    const file = join(fresh(), "calendar.json");
    mkdirSync(`${file}.lock`);
    writeFileSync(join(`${file}.lock`, "owner"), "999999 2026-11-18T00:00:00.000Z\n");
    expect(withFileLock(file, () => "ran", 1_000)).toBe("ran");
  });

  it("gives up on a lock a live process holds", () => {
    const file = join(fresh(), "calendar.json");
    mkdirSync(`${file}.lock`);
    writeFileSync(join(`${file}.lock`, "owner"), `${process.pid} now\n`);
    expect(() => withFileLock(file, () => "ran", 200)).toThrow(/locked by another process/);
  });
});
