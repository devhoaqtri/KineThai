/**
 * One slide of a word's carousel, finished and held, for a renderer to capture.
 *
 * The same VocabularyCard a reader sees, told to start on one page with nothing playing. It
 * lays out at a fixed phone-sized box whatever the window is, so a slide in the studio's
 * filmstrip and a slide in headless Chrome are the same layout. The contract is in
 * ../lib/carousel-contract.
 *
 * Three steps, in order. Fonts load (see ../lib/slide-settle for why this comes first). The
 * word's clue pages are laid out unseen, to find the ceiling that keeps their sizes close.
 * Then the slide mounts and proves itself before announcing "settled".
 *
 * Exports: CarouselFramePage
 * Depends on: VocabularyCard, CarouselChrome, GrammarSlide, carousel plan, formats and
 *   contract, slide-settle, useServedWord
 */

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLoaderData, useParams, useSearch } from "@tanstack/react-router";
import { VocabularyCard } from "./VocabularyCard";
import { CarouselChrome } from "./CarouselChrome";
import { GrammarSlide } from "./GrammarSlide";
import {
  buildCarouselAltText,
  buildCarouselCaption,
  buildCarouselSlides,
  getTextSizeCap,
  splitGrammarRows,
  type CarouselSlide,
} from "../lib/carousel";
import { CAROUSEL_CONTRACT, type SlidePhase } from "../lib/carousel-contract";
import { CAROUSEL_HOOK, CAROUSEL_SWIPE_CUE, CAROUSEL_GRAMMAR_TITLE } from "../lib/carousel-copy";
import {
  CJK_FONTS,
  getCarouselFormat,
  getSlideLayoutSize,
  type CarouselFormat,
} from "../lib/carousel-formats";
import { DeckLocaleContext } from "../lib/deck-locale";
import type { SafeInsets } from "../lib/export-presets";
import type { CardStill } from "../lib/export-layout";
import { grammarRows } from "../lib/grammar";
import { choosePresentation } from "../lib/presets";
import {
  PRONUNCIATION_FONT,
  getSlideFontRequests,
  loadFontStylesheet,
  loadSlideFonts,
  settleSlide,
} from "../lib/slide-settle";
import { buildStages } from "../lib/stages";
import { siteAddress } from "../lib/target-language";
import { useServedWord } from "../hooks/useServedWord";
import "../vocabulary.css";
import "../vocabulary-export.css";
import type { FeedEntry, Presentation } from "../types";

/** Stated rather than read off the page, so a slide can never paint a label unloaded. */
const FIXED_TEXT = ["Đánh vần lại lần nữa", "Viết lại từng nét", "0123456789/@._"];
/** Room the hook takes under the brand tag on slide 1, in layout pixels. */
const HOOK_BAND_PX = 44;

function report(phase: SlidePhase, problem?: string) {
  document.body.dataset.slidePhase = phase;
  if (problem) document.body.dataset.slideProblem = problem;
  else delete document.body.dataset.slideProblem;
}

function stillFor(
  slide: CarouselSlide,
  index: number,
  format: CarouselFormat,
  fallbackFont: string | undefined,
  maxTextSize?: number,
): CardStill {
  return {
    page: slide.page,
    slide: index,
    maxTextSize,
    headBand: slide.kind === "clue" && slide.hook ? HOOK_BAND_PX : 0,
    backdropOnly: slide.kind === "grammar",
    answerBandBottom: format.reveal.bandBottom,
    revealY: format.reveal.wordY,
    panelTop: format.reveal.panelTop,
    fallbackFont,
  };
}

/** The margins one slide keeps: slide 1 is also the grid's thumbnail. */
function safeFor(slide: CarouselSlide, format: CarouselFormat): SafeInsets {
  return slide.kind === "clue" && slide.hook ? (format.gridSafe ?? format.safe) : format.safe;
}

/** The size a laid-out clue page settled on. */
function solvedSize(page: HTMLElement): number | null {
  const word = page.querySelector("[data-kinetic-word]");
  return word ? Number.parseFloat(getComputedStyle(word).fontSize) : null;
}

/** One slide of one word, ready to be captured. */
export function CarouselFramePage() {
  const { code } = useParams({ from: "/carousel/$code" });
  const search = useSearch({ from: "/carousel/$code" });
  const { locale } = useLoaderData({ from: "/carousel/$code" });
  const format = getCarouselFormat(search.format);
  const layout = getSlideLayoutSize(format);
  const [index, setIndex] = useState(search.slide ?? 0);
  const cjkFont = CJK_FONTS[locale];
  const address = search.url ?? siteAddress(locale);
  const handle = search.handle ? `@${search.handle.replace(/^@/, "")}` : undefined;
  // undefined while the lookup is in flight.
  const { word } = useServedWord(useMemo(() => ({ code }), [code]));
  const stageRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  // undefined until the clue pages have been measured; null when no ceiling is needed.
  const [sizeCap, setSizeCap] = useState<number | null | undefined>(undefined);

  const entry = useMemo<FeedEntry | null>(
    () => (word ? { occurrenceId: `carousel-${code}`, position: 0, cycle: 0, word } : null),
    [word, code],
  );
  const presentation = useMemo<Presentation>(
    () => ({
      theme: search.theme ?? "mix",
      // The route validates this against STYLE_IDS, so the cast narrows a checked value.
      style: (search.style ?? "mix") as Presentation["style"],
      autoplay: false,
      dialect: search.dialect,
    }),
    [search.theme, search.style, search.dialect],
  );
  const look = useMemo(
    () => (entry ? choosePresentation(entry.occurrenceId, presentation, entry.position) : null),
    [entry, presentation],
  );
  const stages = useMemo(
    () => (word && look ? buildStages(word, look.style.id) : []),
    [word, look],
  );
  const grammarParts = useMemo(
    () => (word?.grammar ? splitGrammarRows(grammarRows(word.grammar, locale)) : []),
    [word, locale],
  );
  const plan = useMemo(
    () =>
      word && stages.length
        ? buildCarouselSlides(stages, word.word, grammarParts.length)
        : { slides: [], warning: null },
    [word, stages, grammarParts],
  );
  const slide = plan.slides[index];
  const clueSlides = useMemo(
    () => plan.slides.flatMap((item, place) => (item.kind === "clue" ? [{ item, place }] : [])),
    [plan.slides],
  );

  useEffect(() => {
    if (word === undefined) return;
    if (!word) {
      report("missing", `No word has the share code “${code}”.`);
      return;
    }
    if (!look || !plan.slides.length) return;
    const body = document.body.dataset;
    body.slideWord = word.word;
    body.slideIndex = String(index);
    body.slideCount = String(plan.slides.length);
    body.slideSize = `${format.width}x${format.height}`;
    if (plan.warning) body.slideWarning = plan.warning;
    const firstClue = stages[plan.slides[0]!.page]!.text;
    body.slideCaption = buildCarouselCaption({ locale, firstClue, address, handle });
    body.slideAlt = JSON.stringify(
      buildCarouselAltText(plan.slides, stages, {
        word: word.word,
        meaning: word.meaningVi || word.defVi,
      }),
    );
    if (!slide) {
      report("failed", `Slide ${index} does not exist: this word has ${plan.slides.length}.`);
      return;
    }
    let cancelled = false;
    const texts = [
      word.word,
      ...stages.map((stage) => stage.text),
      word.meaningVi ?? "",
      word.defVi,
      word.ipa ?? "",
      word.pos ?? "",
      ...word.usage.map((example) => example.en),
      ...FIXED_TEXT,
      CAROUSEL_HOOK,
      CAROUSEL_SWIPE_CUE,
      CAROUSEL_GRAMMAR_TITLE,
      address,
      handle ?? "",
      "anh.hoa.hàn.nhật.pháp.đức.tbn.chayLá",
      JSON.stringify(word.grammar ?? ""),
    ];
    const pronunciation = `${word.ipa ?? ""} · ${word.pos ?? ""}`;
    Promise.all([
      loadFontStylesheet(PRONUNCIATION_FONT, pronunciation),
      ...(cjkFont ? [loadFontStylesheet(cjkFont)] : []),
    ])
      .then(() =>
        loadSlideFonts(getSlideFontRequests(look.theme.font, texts, cjkFont, pronunciation)),
      )
      .then(
        () => {
          if (!cancelled) setFontsReady(true);
        },
        (error: Error) => {
          if (!cancelled) report("failed", error.message);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [
    word,
    look,
    stages,
    plan,
    slide,
    index,
    code,
    format.width,
    format.height,
    locale,
    address,
    handle,
  ]);

  // Lay every clue page out unseen and read the sizes they settle on.
  useEffect(() => {
    const probe = probeRef.current;
    if (!fontsReady || sizeCap !== undefined || !probe) return;
    let cancelled = false;
    const pages = [...probe.querySelectorAll<HTMLElement>("[data-carousel-probe]")];
    void Promise.all(pages.map((page) => settleSlide(page, format.safe))).then(() => {
      if (cancelled) return;
      const sizes = pages.map(solvedSize).filter((size): size is number => size !== null);
      setSizeCap(getTextSizeCap(sizes) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [fontsReady, sizeCap, format.safe]);

  useEffect(() => {
    const show = (event: Event) => setIndex((event as CustomEvent<number>).detail);
    window.addEventListener(CAROUSEL_CONTRACT.slideEvent, show);
    return () => window.removeEventListener(CAROUSEL_CONTRACT.slideEvent, show);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (sizeCap === undefined || !stage) return;
    let cancelled = false;
    report("settling");
    if (!slide) return;
    void settleSlide(stage, safeFor(slide, format)).then((problems) => {
      if (cancelled) return;
      if (problems.length) report("failed", problems.join("; "));
      else report("settled");
    });
    return () => {
      cancelled = true;
    };
  }, [sizeCap, slide, format]);

  const cardLayout = (still: CardStill, safe: SafeInsets) => ({
    safe,
    // The band is what keeps text clear of the marker; the running bar itself is hidden.
    showProgress: true,
    showBrand: search.brand !== false,
    still,
  });
  const card = (still: CardStill, safe: SafeInsets) =>
    entry && (
      <VocabularyCard
        entry={entry}
        presentation={presentation}
        active
        reducedMotion={false}
        matching={0}
        canAdvance={false}
        onAdvance={() => undefined}
        exportLayout={cardLayout(still, safe)}
      />
    );
  const box = { width: layout.width, height: layout.height } as CSSProperties;

  if (word === undefined) return <main className="vocab-export-frame" aria-busy="true" />;
  if (!entry) {
    return (
      <main className="vocab-export-frame" data-missing="">
        <p>No word has the share code “{code}”.</p>
      </main>
    );
  }

  return (
    <DeckLocaleContext.Provider value={locale}>
      <main className="vocab-export-frame">
        <div
          ref={stageRef}
          {...{ [CAROUSEL_CONTRACT.stageAttribute]: "" }}
          className="vocab-export-stage"
          style={
            {
              ...box,
              ...(cjkFont ? { "--still-fallback-font": `"${cjkFont}"` } : {}),
            } as CSSProperties
          }
        >
          {sizeCap !== undefined && slide && look && (
            <>
              <Fragment key={index}>
                {card(
                  stillFor(slide, index, format, cjkFont, sizeCap ?? undefined),
                  safeFor(slide, format),
                )}
              </Fragment>
              {slide.kind === "grammar" && word && (
                <GrammarSlide
                  word={word.word}
                  rows={grammarParts[slide.part] ?? []}
                  locale={locale}
                  theme={look.theme}
                  safe={format.safe}
                />
              )}
              <CarouselChrome
                slide={slide}
                index={index}
                count={plan.slides.length}
                theme={look.theme}
                safe={safeFor(slide, format)}
                handle={handle}
                address={address}
              />
            </>
          )}
        </div>
        {fontsReady && sizeCap === undefined && (
          <div
            ref={probeRef}
            style={{ position: "fixed", left: -10000, top: 0 }}
            aria-hidden="true"
          >
            {clueSlides.map(({ item, place }) => (
              <div
                key={place}
                data-carousel-probe=""
                className="vocab-export-stage"
                style={{ ...box, visibility: "hidden" }}
              >
                {card(stillFor(item, place, format, cjkFont), safeFor(item, format))}
              </div>
            ))}
          </div>
        )}
      </main>
    </DeckLocaleContext.Provider>
  );
}
