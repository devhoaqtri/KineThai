/**
 * Guard: the carousel route's contract, and that it stays off the hosted site.
 *
 * render-carousel.ts and the studio both wait on these names, and a renamed phase breaks as
 * a timeout rather than as an error. Whether a slide actually settles is a browser question,
 * answered by rendering one: npx tsx scripts/render-carousel.ts <code> --twice
 *
 * Run: npx tsx scripts/check-carousel-frame.ts
 */
import { readFileSync } from "node:fs";
import { CAROUSEL_CONTRACT } from "../src/features/vocabulary/lib/carousel-contract";
import {
  CAROUSEL_FORMATS,
  SLIDE_SCALE,
  getCarouselFormat,
  getSlideLayoutSize,
} from "../src/features/vocabulary/lib/carousel-formats";

const checks: string[] = [];
function check(label: string, passed: boolean, detail?: unknown) {
  checks.push(`${passed ? "OK  " : "FAIL"}  ${label}`);
  if (!passed) {
    process.exitCode = 1;
    if (detail !== undefined) console.error("      ", detail);
  }
}

// Spelled out literally: whoever changes one has to change the renderer too.
check(
  "the phases are the ones a renderer waits on",
  JSON.stringify(CAROUSEL_CONTRACT.phases) ===
    JSON.stringify(["loading", "settling", "settled", "failed", "missing"]),
  CAROUSEL_CONTRACT.phases,
);
check(
  "the stage attribute is data-carousel-stage",
  CAROUSEL_CONTRACT.stageAttribute === "data-carousel-stage",
);

{
  const route = readFileSync("src/routes/carousel.$code.tsx", "utf8");
  check("the route is /carousel/$code", route.includes('createFileRoute("/carousel/$code")'));
  check("it is noindex", route.includes("noindex"));
  check("it validates its search params", route.includes("validateSearch"));
  check(
    "it answers 404 outside the dev server",
    route.includes("if (!import.meta.env.DEV) throw notFound()"),
  );
  check(
    "its page loads only on the dev server",
    /component: import\.meta\.env\.DEV\s*\?\s*lazyRouteComponent/.test(route) &&
      !/^import .*CarouselFramePage/m.test(route),
  );
}

{
  const renderer = readFileSync("scripts/render-carousel.ts", "utf8");
  check("the renderer reads the page's phase", renderer.includes("d.slidePhase"));
  check("the renderer refuses a failed slide", renderer.includes('state.phase === "failed"'));
  const page = readFileSync("src/features/vocabulary/components/CarouselFramePage.tsx", "utf8");
  check(
    "the page loads fonts before it mounts the card",
    page.includes("fontsReady && validSlide && (") && page.includes("loadSlideFonts("),
  );
}

{
  check("there is a format", CAROUSEL_FORMATS.length > 0);
  for (const format of CAROUSEL_FORMATS) {
    const layout = getSlideLayoutSize(format);
    check(
      `${format.id} lays out in whole pixels`,
      Number.isInteger(layout.width) && Number.isInteger(layout.height),
      layout,
    );
    check(`${format.id} is 1080 wide`, format.width === 1080);
    check(`${format.id} keeps Instagram's API range`, format.height / format.width <= 1.25, format);
  }
  check("the scale turns a phone width into 1080", 432 * SLIDE_SCALE === 1080);
  check("an unknown format falls back", getCarouselFormat("nope").width > 0);
}

console.log(checks.join("\n"));
if (process.exitCode) console.error("\ncarousel frame guard FAILED");
else console.log(`\n${checks.length} carousel-frame assertions passed`);
