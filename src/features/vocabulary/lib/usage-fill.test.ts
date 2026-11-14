import { describe, expect, it } from "vitest";
import { caseFill, opensSentence } from "./usage-fill";

describe("caseFill", () => {
  it("capitalizes a fill that opens the example", () => {
    expect(caseFill("", "wash")).toBe("Wash");
    expect(caseFill("  ", "how")).toBe("How");
  });

  it("capitalizes a fill that opens a later sentence", () => {
    expect(caseFill("It is cold. ", "however")).toBe("However");
    expect(caseFill("Really? ", "yes")).toBe("Yes");
    expect(caseFill("Stop! ", "look")).toBe("Look");
  });

  it("looks past opening quotes and marks", () => {
    expect(caseFill('He said, "', "never")).toBe("Never");
    expect(caseFill("¿", "dónde")).toBe("Dónde");
    expect(caseFill("(", "maybe")).toBe("Maybe");
  });

  it("leaves a fill inside its sentence alone", () => {
    expect(caseFill("Can you ", "distinguish")).toBe("distinguish");
    expect(caseFill("Dear Anna, ", "thank")).toBe("thank");
  });

  it("keeps the rest of the word and caseless scripts as they are", () => {
    expect(caseFill("", "iPhone")).toBe("iPhone");
    expect(caseFill("", "Budget")).toBe("Budget");
    expect(caseFill("", "苹果")).toBe("苹果");
    expect(caseFill("", "")).toBe("");
  });
});

describe("opensSentence", () => {
  it("is false mid-sentence and after a comma", () => {
    expect(opensSentence("The farmers get a ")).toBe(false);
    expect(opensSentence("It is cold, ")).toBe(false);
    expect(opensSentence("It is cold, (")).toBe(false);
  });
});
