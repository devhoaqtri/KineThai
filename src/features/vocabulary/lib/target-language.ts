/**
 * Map the visited address to the answer language. Vietnamese UI never varies; only the
 * deck and the page title do. Unknown hosts (preview, localhost, IPs, anh.*) fall back to
 * English and never throw. Host is client-controlled: use it only to pick public content.
 *
 * A language in HIDDEN_LOCALES is withheld from readers: in a production build its address
 * serves the English site (deck, title and all) and its tile leaves the language drawer,
 * while its deck stays compiled and keeps taking imports. `npm run dev` still serves it,
 * so it can be checked before it is switched back on by removing it from the set.
 *
 * Exports: TargetLocale, TARGET_LOCALES, HIDDEN_LOCALES, isLocaleShown, addressLocale,
 *          resolveTarget, siteTitle, siteBrand, siteAddress, siteDescription, siteImage,
 *          sitePageHead, languageName
 */
export type TargetLocale = "en" | "zh" | "ko" | "ja" | "fr" | "de" | "es";

export const TARGET_LOCALES: readonly TargetLocale[] = ["en", "zh", "ko", "ja", "fr", "de", "es"];

const SUBDOMAINS: Record<string, TargetLocale> = {
  hoa: "zh",
  han: "ko",
  nhat: "ja",
  // Punycode forms of hàn / nhật, in case those IDN addresses are attached.
  "xn--hn-ula": "ko",
  "xn--nht-xpa": "ja",
  phap: "fr",
  duc: "de",
  tbn: "es",
};

/** Languages readers cannot reach yet: their addresses serve English in production. */
export const HIDDEN_LOCALES: ReadonlySet<TargetLocale> = new Set<TargetLocale>(["ko"]);

/** A dev server (vite) shows hidden languages; a production build and plain node do not. */
const SHOW_HIDDEN = Boolean(import.meta.env?.DEV);

/** @param locale Deck locale. @returns Whether readers of this build can reach it. */
export function isLocaleShown(locale: TargetLocale): boolean {
  return SHOW_HIDDEN || !HIDDEN_LOCALES.has(locale);
}

/**
 * The language an address names, whether or not it is shown — for tooling that drives a
 * dev server, where hidden languages are served.
 * @param host Host header or location.host (may carry a port). @returns The address's locale.
 */
export function addressLocale(host: string | null | undefined): TargetLocale {
  if (!host) return "en";
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  const first = name.split(".")[0] ?? "";
  return SUBDOMAINS[first] ?? "en";
}

/** @param host Host header or location.host (may carry a port). @returns The deck locale. */
export function resolveTarget(host: string | null | undefined): TargetLocale {
  const locale = addressLocale(host);
  return isLocaleShown(locale) ? locale : "en";
}

const TITLES: Record<TargetLocale, string> = {
  en: "anh.chayLá",
  zh: "hoa.chayLá",
  ko: "hàn.chayLá",
  ja: "nhật.chayLá",
  fr: "pháp.chayLá",
  de: "đức.chayLá",
  es: "tbn.chayLá",
};

/** @param locale Deck locale. @returns Page title for that address. */
export function siteTitle(locale: TargetLocale): string {
  return TITLES[locale];
}

/**
 * The toolbar brand renders the accent-coloured "Lá" in its own span, so the title
 * must arrive pre-split. Every title ends in "chayLá"; only the lead varies.
 * @param locale Deck locale. @returns Lead ("hoa.chay") plus accent ("Lá").
 */
export function siteBrand(locale: TargetLocale): { lead: string; accent: string } {
  const title = siteTitle(locale);
  const at = title.lastIndexOf("chay");
  return { lead: title.slice(0, at + "chay".length), accent: title.slice(at + "chay".length) };
}

const ADDRESSES: Record<TargetLocale, string> = {
  en: "anh.chayla.app",
  zh: "hoa.chayla.app",
  ko: "han.chayla.app",
  ja: "nhat.chayla.app",
  fr: "phap.chayla.app",
  de: "duc.chayla.app",
  es: "tbn.chayla.app",
};

/** @param locale Deck locale. @returns The public address for that deck, with no scheme. */
export function siteAddress(locale: TargetLocale): string {
  return ADDRESSES[locale];
}

/**
 * An address as something a reader types into a browser: with its https:// prefix, so it
 * reads as a link and not as a word. One that already carries a scheme is kept as it is.
 * @param address - e.g. "anh.chayla.app"
 * @returns e.g. "https://anh.chayla.app"
 * @pure true
 */
export function withScheme(address: string): string {
  return /^https?:\/\//i.test(address) ? address : `https://${address}`;
}

/**
 * The Vietnamese name of the language a deck teaches, without the "tiếng" prefix — so
 * the copy sites around it can decide whether to say "tiếng Hàn", "môn tiếng Hàn", "bằng
 * tiếng Hàn", etc. The English entry is "Anh" (never " tiếng Anh"), matching the "tiếng "
 * already in the reader's labels.
 */
const LANGUAGE_NAMES: Record<TargetLocale, string> = {
  en: "Anh",
  zh: "Trung",
  ko: "Hàn",
  ja: "Nhật",
  fr: "Pháp",
  de: "Đức",
  es: "Tây Ban Nha",
};

/** @param locale Deck locale. @returns Vietnamese name of the target language, sans "tiếng". */
export function languageName(locale: TargetLocale): string {
  return LANGUAGE_NAMES[locale];
}

/**
 * What a language site is, in one line: the default search and link-preview description.
 * @pure true
 */
export function siteDescription(locale: TargetLocale): string {
  return `Học từ vựng tiếng ${languageName(locale)} qua gợi ý tiếng Việt: đoán từ trước khi đáp án hiện ra. Miễn phí.`;
}

/**
 * A language site's link-preview image (scripts/make-brand-images.ts), as an absolute URL:
 * Facebook, Zalo and Messenger do not resolve a relative one.
 * @pure true
 */
export function siteImage(locale: TargetLocale): string {
  return `${withScheme(siteAddress(locale))}/og/${locale}.jpg`;
}

/** Shared leaf metadata keeps browser and sharing titles aligned with the domain. */
export function sitePageHead(
  locale: TargetLocale = "en",
  section = "",
  description = siteDescription(locale),
) {
  const title = section ? `${section} — ${siteTitle(locale)}` : siteTitle(locale);
  const image = siteImage(locale);
  const imageAlt = `${siteTitle(locale)}: ${siteDescription(locale)}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:site_name", content: siteTitle(locale) },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "vi_VN" },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
  };
}
