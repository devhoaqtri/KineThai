/**
 * Map the visited address to the answer language. Vietnamese UI never varies; only the
 * deck and the page title do. Unknown hosts (preview, localhost, IPs, the root deploy)
 * fall back to Japanese, the app's default deck, and never throw. Host is
 * client-controlled: use it only to pick public content.
 *
 * Exports: DEFAULT_TARGET, TARGET_LOCALES, TargetLocale, resolveTarget, siteTitle, siteBrand,
 *   sitePageHead
 */
export const TARGET_LOCALES = ["en", "zh", "ko", "ja", "fr", "de", "es"] as const;

export type TargetLocale = (typeof TARGET_LOCALES)[number];

/** The deck served when nothing on the address names another language. */
export const DEFAULT_TARGET: TargetLocale = "ja";

const SUBDOMAINS: Record<string, TargetLocale> = {
  anh: "en",
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

/** @param host Host header or location.host (may carry a port). @returns The deck locale. */
export function resolveTarget(host: string | null | undefined): TargetLocale {
  if (!host) return DEFAULT_TARGET;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  const first = name.split(".")[0] ?? "";
  return SUBDOMAINS[first] ?? DEFAULT_TARGET;
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

/** Shared leaf metadata keeps browser and sharing titles aligned with the domain. */
export function sitePageHead(
  locale: TargetLocale = DEFAULT_TARGET,
  section = "",
  description = "言葉にちょっとした元気を",
) {
  const title = section ? `${section} — ${siteTitle(locale)}` : siteTitle(locale);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  };
}
