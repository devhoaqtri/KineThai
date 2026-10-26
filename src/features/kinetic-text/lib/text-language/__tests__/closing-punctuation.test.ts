import { describe, expect, it } from "vitest";
import { CLOSING_PUNCTUATION_CLASS, endsWithPunctuation } from "../closing-punctuation";

describe("CLOSING_PUNCTUATION_CLASS", () => {
  it("names the two straight quotes explicitly", () => {
    expect(CLOSING_PUNCTUATION_CLASS).toContain('"');
    expect(CLOSING_PUNCTUATION_CLASS).toContain("'");
  });
  it("pulls in Unicode final punctuation", () =>
    expect(CLOSING_PUNCTUATION_CLASS).toContain("\\p{Pf}"));
  it("pulls in Unicode close punctuation", () =>
    expect(CLOSING_PUNCTUATION_CLASS).toContain("\\p{Pe}"));
  it("compiles into a unicode-aware class", () => {
    const pattern = new RegExp(CLOSING_PUNCTUATION_CLASS, "u");
    expect(pattern.flags).toContain("u");
  });
  it("matches a right double quote", () =>
    expect(new RegExp(CLOSING_PUNCTUATION_CLASS, "u").test("”")).toBe(true));
  it("matches a closing bracket", () =>
    expect(new RegExp(CLOSING_PUNCTUATION_CLASS, "u").test("]")).toBe(true));
  it("matches a CJK closing bracket", () =>
    expect(new RegExp(CLOSING_PUNCTUATION_CLASS, "u").test("」")).toBe(true));
  it("does not match a letter", () =>
    expect(new RegExp(CLOSING_PUNCTUATION_CLASS, "u").test("a")).toBe(false));
  it("does not match an opening quote", () =>
    expect(new RegExp(CLOSING_PUNCTUATION_CLASS, "u").test("“")).toBe(false));
});

describe("endsWithPunctuation", () => {
  const sentenceEnd = endsWithPunctuation("[,.;]");

  it("returns a unicode-flagged regex", () => expect(sentenceEnd.flags).toContain("u"));
  it("matches a word ending in a comma", () => expect(sentenceEnd.test("anh,")).toBe(true));
  it("matches a word ending in a full stop", () => expect(sentenceEnd.test("anh.")).toBe(true));
  it("matches a word ending in a semicolon", () => expect(sentenceEnd.test("anh;")).toBe(true));
  it("does not match a bare word", () => expect(sentenceEnd.test("anh")).toBe(false));
  it("does not match a leading mark", () => expect(sentenceEnd.test(",anh")).toBe(false));
  it("lets a closing quote ride after the full stop", () =>
    expect(endsWithPunctuation("[.]").test("nhé.”")).toBe(true));
  it("lets a closing bracket ride after the mark", () =>
    expect(endsWithPunctuation("[.]").test("end.)")).toBe(true));
  it("lets several closing marks ride along", () =>
    expect(endsWithPunctuation("[!]").test("wow!”」")).toBe(true));
  it("anchors to the end of the token", () =>
    expect(endsWithPunctuation("[.]").test("a.b")).toBe(false));
  it("treats a question mark lead as its own class", () => {
    const ask = endsWithPunctuation("[?]");
    expect(ask.test("hả?")).toBe(true);
    expect(ask.test("hả.")).toBe(false);
  });
  it("handles an empty lead without throwing", () =>
    expect(() => endsWithPunctuation("")).not.toThrow());
});
