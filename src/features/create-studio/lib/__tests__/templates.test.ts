import { describe, expect, it } from "vitest";
import type { CanvasSpec } from "@/features/canvas";
import {
  ANIMATION_TEMPLATES,
  DEFAULT_TRANSITION_PATH,
  PAGE_TITLES,
  PLACEMENTS,
  PRELOADED_PHOTOS,
  PRELOADED_VIDEOS,
  STATUS_CANVAS,
  isTemplateActive,
} from "../templates";

describe("template catalog", () => {
  it("exposes a non-empty animation list", () => expect(ANIMATION_TEMPLATES.length).toBeGreaterThan(0));
  it("gives every template a unique id", () => {
    const ids = ANIMATION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every template a label, mood and backdrop", () => {
    for (const template of ANIMATION_TEMPLATES) {
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.mood.length).toBeGreaterThan(0);
      expect(template.backdrop.mode.length).toBeGreaterThan(0);
    }
  });
  it("lists three placements", () => expect(PLACEMENTS).toHaveLength(3));
  it("titles every studio page", () => {
    for (const key of ["write", "background", "font", "color", "layout", "motion"] as const) {
      expect(PAGE_TITLES[key].title.length).toBeGreaterThan(0);
      expect(PAGE_TITLES[key].subtitle.length).toBeGreaterThan(0);
    }
  });
  it("keeps the status canvas centred with no text", () => {
    expect(STATUS_CANVAS.text).toBe("");
    expect(STATUS_CANVAS.x).toBe(50);
    expect(STATUS_CANVAS.y).toBe(50);
  });
  it("provides a default transition path with gradients", () => {
    expect(DEFAULT_TRANSITION_PATH.id.length).toBeGreaterThan(0);
    expect(DEFAULT_TRANSITION_PATH.gradients.length).toBeGreaterThan(0);
  });
  it("exposes preloaded media arrays", () => {
    expect(Array.isArray(PRELOADED_PHOTOS)).toBe(true);
    expect(Array.isArray(PRELOADED_VIDEOS)).toBe(true);
  });
});

describe("isTemplateActive", () => {
  it("matches a gradient template with an identical spec and backdrop", () => {
    const template = ANIMATION_TEMPLATES.find((t) => t.backdrop.mode === "gradient")!;
    expect(template.backdrop.mode).toBe("gradient");
    const spec = { ...STATUS_CANVAS, ...template.spec } as CanvasSpec;
    const gradient = (template.backdrop as { gradient: string }).gradient;
    expect(
      isTemplateActive(template, spec, gradient, "gradient", DEFAULT_TRANSITION_PATH, "", "", "", ""),
    ).toBe(true);
  });
  it("rejects a gradient template when the background differs", () => {
    const template = ANIMATION_TEMPLATES.find((t) => t.backdrop.mode === "gradient")!;
    const spec = { ...STATUS_CANVAS, ...template.spec } as CanvasSpec;
    expect(
      isTemplateActive(template, spec, "#000000", "gradient", DEFAULT_TRANSITION_PATH, "", "", "", ""),
    ).toBe(false);
  });
  it("rejects a scene template with the wrong mode", () => {
    const template = ANIMATION_TEMPLATES.find((t) => t.backdrop.mode === "scene")!;
    const spec = { ...STATUS_CANVAS, ...template.spec } as CanvasSpec;
    expect(
      isTemplateActive(template, spec, "", "gradient", DEFAULT_TRANSITION_PATH, "", "", "", ""),
    ).toBe(false);
  });
  it("rejects any template whose motion fields differ", () => {
    const template = ANIMATION_TEMPLATES[0];
    const spec = { ...STATUS_CANVAS, ...template.spec, rhythm: "poetic" } as CanvasSpec;
    // Force a mismatch unless the template already used "poetic".
    if (template.spec.rhythm === "poetic") return;
    expect(
      isTemplateActive(template, spec, "", "gradient", DEFAULT_TRANSITION_PATH, "", "", "", ""),
    ).toBe(false);
  });
});
