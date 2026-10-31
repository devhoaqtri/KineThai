import { describe, expect, it } from "vitest";
import { foldText, plainText, searchWords, sortWords } from "../word-library";

const word = (id: string, text: string, rest: Record<string, unknown> = {}) => ({
  id,
  word: text,
  ...rest,
});

describe("foldText", () => {
  it("forgives accents, đ and a deck's marks", () => {
    expect(foldText("Bạn")).toBe("ban");
    expect(foldText("đường")).toBe("duong");
    expect(foldText("ba_lô")).toBe("ba lo");
    expect(foldText("ba lô")).toBe("ba lo");
    expect(foldText("đang=nằm | trên /biển/")).toBe("dang nam tren bien");
  });
});

describe("plainText", () => {
  it("shows a sentence as a reader sees it", () => {
    expect(plainText("Tự hình_dung | trong /đầu/ đang=nằm")).toBe(
      "Tự hình dung trong đầu đang nằm",
    );
  });
});

describe("searchWords", () => {
  const words = [
    word("a", "Aussicht", { meaningVi: "bus" }),
    word("b", "Bushaltestelle"),
    word("c", "Bus", { shareCode: "2K3" }),
    word("d", "Omnibus"),
    word("e", "Fahrt", { defVi: "đi bằng bus" }),
    word("f", "Baum"),
  ];

  it("leads with the headword, then its meaning, then its clues", () => {
    expect(searchWords(words, "bus").map((entry) => entry.id)).toEqual(["c", "b", "d", "a", "e"]);
  });

  it("finds a word by its share code in any case", () => {
    expect(searchWords(words, "2k3").map((entry) => entry.id)).toEqual(["c"]);
  });

  it("finds accented text from plain typing", () => {
    expect(searchWords([word("x", "tưởng_tượng")], "tuong tuong")).toHaveLength(1);
  });

  it("returns everything for an empty query and nothing for no match", () => {
    expect(searchWords(words, "  ")).toHaveLength(words.length);
    expect(searchWords(words, "zzz")).toEqual([]);
  });
});

describe("sortWords", () => {
  it("orders by the deck's own alphabet without changing the input", () => {
    const input = [word("1", "Zug"), word("2", "Baum"), word("3", "Äpfel")];
    expect(sortWords(input, "de").map((entry) => entry.id)).toEqual(["3", "2", "1"]);
    expect(input[0]!.id).toBe("1");
  });
});
