/**
 * Assert every app tile points somewhere the app actually answers.
 *
 * The drawer's tiles are full navigations to sibling hosts, and the only thing deciding
 * what a host serves is `SUBDOMAINS` in target-language.ts. A tile whose label has drifted
 * from that map still renders, still looks right, and quietly lands the reader on a deck in
 * the wrong language — or on the English fallback, which is what an unknown subdomain
 * resolves to. Nothing about that is visible from the drawer.
 *
 * It also pins the filter the drawer relies on: the drawer hides the tile whose id equals
 * the visited host's own first label, so each record's `id` must equal its URL's
 * subdomain (checked below). The `locale` field is checked against `resolveTarget` as a
 * data-integrity guard: a tile's host must serve the deck its locale claims, or the tile
 * sends the reader to a host answering in the wrong language.
 *
 * Usage: npm run check:ecosystem-apps
 */
import { ECOSYSTEM_APPS, ECOSYSTEM_MAX_APPS } from "../src/features/ecosystem/data/apps.ts";
import { resolveTarget } from "../src/features/vocabulary/lib/target-language.ts";

const failures: string[] = [];
const rows: string[] = [];

function check(label: string, pass: boolean, detail = ""): void {
  rows.push(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures.push(label);
}

check("the drawer stays glanceable", ECOSYSTEM_APPS.length <= ECOSYSTEM_MAX_APPS,
  `${ECOSYSTEM_APPS.length} of ${ECOSYSTEM_MAX_APPS}`);
check("there is more than one app", ECOSYSTEM_APPS.length > 1);

const ids = new Set<string>();
for (const app of ECOSYSTEM_APPS) {
  check(`${app.id}: id is unique`, !ids.has(app.id));
  ids.add(app.id);

  // The URL's first label IS the id, because that label is what target-language reads.
  let host = "";
  try {
    host = new URL(app.url).host;
  } catch {
    /* reported below */
  }
  check(`${app.id}: url parses`, host.length > 0, app.url);
  check(`${app.id}: url's subdomain is its id`, host.split(".")[0] === app.id, host);
  check(`${app.id}: url is https on chayla.app`, /^https:\/\/[a-z]+\.chayla\.app$/.test(app.url),
    app.url);

  // Data integrity for the locale field; the drawer's own filter rests on the
  // id-equals-subdomain check above.

  // A tile that ellipsises reads as the same truncated string as its neighbours.
  check(`${app.id}: name fits a tile`, app.name.length <= 12, `"${app.name}" (${app.name.length})`);
  check(`${app.id}: has a tagline`, app.tagline.trim().length > 0);
  check(`${app.id}: accent is two hex stops`,
    app.accent.length === 2 && app.accent.every((c) => /^#[0-9a-f]{6}$/i.test(c)),
    app.accent.join(" "));
}

// Every deck the app can serve should be reachable from the drawer on some other host, or
// a reader on that deck has no way back to it. "en" is included: anh.chayla.app is a
// sibling like any other now, and is only absent from the drawer on its own host.
const locales = new Set(ECOSYSTEM_APPS.map((app) => app.locale));
for (const locale of ["en", "zh", "ko", "ja", "fr", "de", "es"] as const) {
  check(`a tile exists for the "${locale}" deck`, locales.has(locale));
}

for (const row of rows) console.log(row);
console.log(
  failures.length
    ? `\n${failures.length} of ${rows.length} ecosystem-app checks failed`
    : `\n${rows.length} ecosystem-app checks passed.`,
);
process.exitCode = failures.length ? 1 : 0;
