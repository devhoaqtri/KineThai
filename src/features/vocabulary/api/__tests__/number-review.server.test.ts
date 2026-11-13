import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideNumber, DECISIONS_FILE, listNumberReview } from "../number-review.server";

const card = {
  id: "vi-floor",
  word: "floor",
  meaningVi: "tầng",
  defVi: "Mặt /bằng_phẳng/ | để đi lại.",
  leadVi: "Nhà mình | ở tầng hai | /chung_cư/ cũ.",
  anticipateVi: "Leo bộ /mệt_nhoài/?",
  level: "A1",
  chars: 5,
  initial: "F",
  usage: [{ en: "We live on the second _____.", vi: "Chúng tôi sống ở tầng hai." }],
};

const deck = { revision: "r", name: "n", count: 1, levels: ["A1"], words: [card] };

describe("number review", () => {
  let root: string;
  const packPath = () => join(root, "src/features/vocabulary/data/packs/en-a1.json");
  const stored = async () => JSON.parse(await readFile(packPath(), "utf8")).words[0];
  const clueLedger = () => join(root, "scripts/data/clue-review-ledger.json");

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "numbers-"));
    await mkdir(join(root, "src/features/vocabulary/data/packs"), { recursive: true });
    await mkdir(join(root, "scripts/data"), { recursive: true });
    await writeFile(packPath(), `${JSON.stringify(deck, null, 2)}\n`);
    await writeFile(
      clueLedger(),
      `${JSON.stringify(
        { entries: [{ id: "vi-floor", field: "leadVi", text: card.leadVi, verdict: "ok" }] },
        null,
        2,
      )}\n`,
    );
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("lists the unsure numbers with the sentence each would become", async () => {
    const { items, writable } = await listNumberReview(root);
    expect(writable).toBe(true);
    expect(items.map((item) => [item.field, item.words, item.after, item.choice])).toEqual([
      ["leadVi", "hai", "Nhà mình | ở tầng 2 | /chung_cư/ cũ.", null],
      ["usage[0].vi", "hai", "Chúng tôi sống ở tầng 2.", null],
    ]);
  });

  it("writes digits on 'number', carries the clue verdict along, and undoes on 'word'", async () => {
    const [lead] = (await listNumberReview(root)).items;
    const written = await decideNumber(
      { key: lead!.key, choice: "number", expected: lead!.before },
      root,
    );
    expect(written.choice).toBe("number");
    expect(written.current).toBe(true);
    expect((await stored()).leadVi).toBe("Nhà mình | ở tầng 2 | /chung_cư/ cũ.");
    const moved = JSON.parse(await readFile(clueLedger(), "utf8")).entries[0];
    expect(moved.text).toBe("Nhà mình | ở tầng 2 | /chung_cư/ cũ.");

    // Listed again as written, from the ledger.
    const again = (await listNumberReview(root)).items.find((item) => item.key === lead!.key);
    expect(again?.choice).toBe("number");

    const undone = await decideNumber(
      { key: lead!.key, choice: "word", expected: written.after },
      root,
    );
    expect(undone.choice).toBe("word");
    expect((await stored()).leadVi).toBe(card.leadVi);
    const ledger = JSON.parse(await readFile(join(root, DECISIONS_FILE), "utf8"));
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].choice).toBe("word");
  });

  it("writes a usage line without touching the others", async () => {
    const usage = (await listNumberReview(root)).items.find(
      (item) => item.field === "usage[0].vi",
    )!;
    await decideNumber({ key: usage.key, choice: "number", expected: usage.before }, root);
    const word = await stored();
    expect(word.usage).toEqual([
      { en: "We live on the second _____.", vi: "Chúng tôi sống ở tầng 2." },
    ]);
    expect(word.leadVi).toBe(card.leadVi);
  });

  it("keeps the words on 'word' and remembers the choice", async () => {
    const [lead] = (await listNumberReview(root)).items;
    await decideNumber({ key: lead!.key, choice: "word", expected: lead!.before }, root);
    expect((await stored()).leadVi).toBe(card.leadVi);
    const listed = (await listNumberReview(root)).items.find((item) => item.key === lead!.key);
    expect(listed?.choice).toBe("word");
  });

  it("refuses a page that no longer matches the file", async () => {
    const [lead] = (await listNumberReview(root)).items;
    await expect(
      decideNumber({ key: lead!.key, choice: "number", expected: "Một câu khác." }, root),
    ).rejects.toThrow(/changed/);
    await expect(
      decideNumber(
        { key: `packs/../../x|vi-floor|leadVi|a#0`, choice: "number", expected: "" },
        root,
      ),
    ).rejects.toThrow(/Unknown number key/);
    expect((await stored()).leadVi).toBe(card.leadVi);
  });
});
