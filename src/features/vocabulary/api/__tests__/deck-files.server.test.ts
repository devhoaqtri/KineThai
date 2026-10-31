import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deckFilesWritable, readDeckWord, updateDeckWord } from "../deck-files.server";

const card = (id: string, word: string) => ({
  id,
  word,
  meaningVi: "tưởng_tượng",
  defVi: "Tự hình_dung | trong đầu.",
  leadVi: "Chỉ cần nhắm mắt.",
  anticipateVi: "Bay nào!",
  level: "A1",
  chars: word.length,
  initial: word[0]!.toUpperCase(),
  usage: [{ en: "Ich _____ das.", vi: "Tôi hình dung." }],
});

const deck = {
  revision: "abc",
  name: "deck",
  count: 2,
  levels: ["A1"],
  words: [card("haus", "Haus"), card("baum", "Baum")],
};

describe("deck files", () => {
  let root: string;
  const path = () => join(root, "de", "de-a1.json");

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "decks-"));
    await mkdir(join(root, "de"));
    await writeFile(path(), `${JSON.stringify(deck, null, 2)}\n`);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const save = (edit: object, expected: object, id = "haus") =>
    updateDeckWord("de", id, edit, expected, root);

  it("reads a word as stored, marks and all", async () => {
    const found = await readDeckWord("de", "haus", root);
    expect(found?.word.defVi).toBe("Tự hình_dung | trong đầu.");
    expect(found?.file).toBe(join("de", "de-a1.json"));
  });

  it("changes only that word's line in the file", async () => {
    const before = (await readFile(path(), "utf8")).split("\n");
    await save({ defVi: "Mới_toanh." }, { defVi: "Tự hình_dung | trong đầu." });
    const after = (await readFile(path(), "utf8")).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, index) => line !== before[index]);
    expect(changed).toEqual([`      "defVi": "Mới_toanh.",`]);
  });

  it("keeps a deck's lack of a final newline", async () => {
    await writeFile(path(), JSON.stringify(deck, null, 2));
    await save({ defVi: "Khác." }, { defVi: "Tự hình_dung | trong đầu." });
    expect((await readFile(path(), "utf8")).endsWith("}")).toBe(true);
  });

  it("restates what is worked out from the word", async () => {
    const { word } = await save({ word: "Wohnung" }, { word: "Haus" });
    expect(word).toMatchObject({ word: "Wohnung", chars: 7, initial: "W" });
  });

  it("refuses a save based on a stale copy", async () => {
    await expect(save({ defVi: "Mới." }, { defVi: "Không phải bản này." })).rejects.toThrow(
      "changed somewhere else",
    );
    expect(JSON.parse(await readFile(path(), "utf8"))).toEqual(deck);
  });

  it("refuses an edit that would break the deck and leaves the file alone", async () => {
    await expect(save({ word: "Baum" }, { word: "Haus" })).rejects.toThrow("Duplicate word");
    await expect(
      save({ anticipateVi: "Das Haus ist hier" }, { anticipateVi: "Bay nào!" }),
    ).rejects.toThrow("Contains the English answer");
    expect(JSON.parse(await readFile(path(), "utf8"))).toEqual(deck);
    expect(await readdir(join(root, "de"))).toEqual(["de-a1.json"]);
  });

  it("does not lose a save when two arrive together", async () => {
    await Promise.all([
      save({ leadVi: "Một." }, { leadVi: "Chỉ cần nhắm mắt." }, "haus"),
      save({ leadVi: "Hai." }, { leadVi: "Chỉ cần nhắm mắt." }, "baum"),
    ]);
    const { words } = JSON.parse(await readFile(path(), "utf8"));
    expect(words.map((word: { leadVi: string }) => word.leadVi)).toEqual(["Một.", "Hai."]);
  });

  it("answers plainly where there is no deck to write", async () => {
    expect(await deckFilesWritable("de", root)).toBe(true);
    expect(await deckFilesWritable("fr", root)).toBe(false);
    expect(await readDeckWord("fr", "haus", root)).toBeNull();
    await expect(save({ defVi: "x" }, { defVi: "x" }, "missing")).rejects.toThrow("no deck file");
  });
});
