import { describe, expect, it } from "vitest";
import { largestImage, MAX_CAROUSEL_ITEMS, publishCarousel } from "../../../../../scripts/lib/meta-publish";

describe("largestImage", () => {
  it("picks Meta's biggest rendition of a hosted page", () => {
    const images = [
      { width: 960, height: 1200, source: "https://cdn/960.jpg" },
      { width: 1080, height: 1350, source: "https://cdn/1080.jpg" },
      { width: 130, height: 163, source: "https://cdn/130.jpg" },
    ];
    expect(largestImage(images)).toBe("https://cdn/1080.jpg");
  });

  it("is null until Meta has made any", () => {
    expect(largestImage(undefined)).toBeNull();
    expect(largestImage([])).toBeNull();
  });
});

describe("publishCarousel", () => {
  const config = {
    version: "v23.0",
    pageId: "page",
    pageToken: "token",
    igUserId: "ig",
    appId: null,
    appSecret: null,
    userToken: null,
    dryRun: true,
  };

  it("refuses a carousel of one page or of more than Instagram allows", async () => {
    await expect(publishCarousel({ config, images: ["/a/01.jpg"], caption: "", log: () => {} })).rejects.toThrow(/2 to 20/);
    const many = Array.from({ length: MAX_CAROUSEL_ITEMS + 1 }, (_, i) => `/a/${i + 1}.jpg`);
    await expect(publishCarousel({ config, images: many, caption: "", log: () => {} })).rejects.toThrow(/2 to 20/);
  });

  it("refuses an image that is not a JPEG", async () => {
    await expect(
      publishCarousel({ config, images: [import.meta.filename, import.meta.filename], caption: "", log: () => {} }),
    ).rejects.toThrow(/only JPEG/);
  });
});
