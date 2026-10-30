/**
 * One slide of a word, finished and held, for a renderer to capture.
 *
 * The same VocabularyCard a reader sees, told to start on one page with nothing playing. It
 * lays out at a fixed phone-sized box whatever the window is, so a slide in the studio's
 * filmstrip and a slide in headless Chrome are the same layout. The contract is in
 * ../lib/carousel-contract.
 *
 * Fonts load first and the card mounts after (see ../lib/slide-settle for why the order
 * matters), then the slide proves itself before announcing "settled".
 *
 * Exports: CarouselFramePage
 * Depends on: VocabularyCard, carousel formats and contract, slide-settle, useServedWord
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLoaderData, useParams, useSearch } from "@tanstack/react-router";
import { VocabularyCard } from "./VocabularyCard";
import { CAROUSEL_CONTRACT, type SlidePhase } from "../lib/carousel-contract";
import { getCarouselFormat, getSlideLayoutSize } from "../lib/carousel-formats";
import { DeckLocaleContext } from "../lib/deck-locale";
import { choosePresentation } from "../lib/presets";
import { getSlideFontRequests, loadSlideFonts, settleSlide } from "../lib/slide-settle";
import { buildStages } from "../lib/stages";
import { useServedWord } from "../hooks/useServedWord";
import "../vocabulary.css";
import "../vocabulary-export.css";
import type { FeedEntry, Presentation } from "../types";

/** Stated rather than read off the fonts, so a slide can never paint a label unloaded. */
const CODA_LABELS = ["Đánh vần lại lần nữa", "Viết lại từng nét"];

function report(phase: SlidePhase, problem?: string) {
  document.body.dataset.slidePhase = phase;
  if (problem) document.body.dataset.slideProblem = problem;
  else delete document.body.dataset.slideProblem;
}

/** One slide of one word, ready to be captured. */
export function CarouselFramePage() {
  const { code } = useParams({ from: "/carousel/$code" });
  const search = useSearch({ from: "/carousel/$code" });
  const { locale } = useLoaderData({ from: "/carousel/$code" });
  const format = getCarouselFormat(search.format);
  const layout = getSlideLayoutSize(format);
  const slide = search.slide ?? 0;
  // undefined while the lookup is in flight.
  const { word } = useServedWord(useMemo(() => ({ code }), [code]));
  const stageRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);

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
  // Every clue page, the answer, and the spelling coda after it.
  const slideCount = stages.length + 1;
  const validSlide = slide < slideCount;

  useEffect(() => {
    if (word === undefined) return;
    if (!word) {
      report("missing", `No word has the share code “${code}”.`);
      return;
    }
    if (!look) return;
    document.body.dataset.slideWord = word.word;
    document.body.dataset.slideIndex = String(slide);
    document.body.dataset.slideCount = String(slideCount);
    document.body.dataset.slideSize = `${format.width}x${format.height}`;
    if (!validSlide) {
      report("failed", `Slide ${slide} does not exist: this word has ${slideCount}.`);
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
      ...CODA_LABELS,
      "anh.hoa.hàn.nhật.pháp.đức.tbn.chayLá",
    ];
    loadSlideFonts(getSlideFontRequests(look.theme.font, texts)).then(
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
  }, [word, look, stages, slide, slideCount, validSlide, code, format.width, format.height]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!fontsReady || !stage) return;
    let cancelled = false;
    report("settling");
    void settleSlide(stage, format.safe).then((problems) => {
      if (cancelled) return;
      if (problems.length) report("failed", problems.join("; "));
      else report("settled");
    });
    return () => {
      cancelled = true;
    };
  }, [fontsReady, format.safe]);

  const exportLayout = useMemo(
    () => ({
      safe: format.safe,
      showProgress: false,
      showBrand: search.brand !== false,
      still: { page: slide },
    }),
    [format.safe, search.brand, slide],
  );

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
          style={{ width: layout.width, height: layout.height } as CSSProperties}
        >
          {fontsReady && validSlide && (
            <VocabularyCard
              entry={entry}
              presentation={presentation}
              active
              reducedMotion={false}
              matching={0}
              canAdvance={false}
              onAdvance={() => undefined}
              exportLayout={exportLayout}
            />
          )}
        </div>
      </main>
    </DeckLocaleContext.Provider>
  );
}
