/**
 * App info: what chayLá is right now — an experiment, filled with AI-written decks, with new
 * features waiting on how it is received — and an open door for language professionals.
 * Every statement is its own line, led by an emoji, with the words that carry it
 * highlighted, so the page reads in one glance instead of as a wall of paragraphs.
 *
 * Exports: AppInfoContent, AppInfoPage
 * Depends on: router Link, lucide icons, target-language (brand, locale), vocabulary.css
 */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import { languageName, siteTitle, type TargetLocale } from "../lib/target-language";
import { INFO_PAGE_LINKS, type InfoPageLink } from "../lib/site-links";
import "../vocabulary.css";

/** The highlighted words of a line; the line's tone, else its section's, picks the colour. */
function Hl({ children }: { children: ReactNode }) {
  return <strong className="vocab-info-hl">{children}</strong>;
}

type Tone = "citrus" | "mint" | "cyber" | "magenta";
/**
 * A line may carry its own tone, so lines gathered from different topics keep their colour,
 * and a row of language chips under its sentence.
 */
type Line = { emoji: string; tone?: Tone; text: ReactNode; chips?: readonly TargetLocale[] };

/** The flag a language chip leads with. */
const LANGUAGE_FLAGS: Record<TargetLocale, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  ko: "🇰🇷",
  zh: "🇨🇳",
  ja: "🇯🇵",
};

/**
 * Every deck already prepared besides English, hidden ones (Korean) included: the call for
 * help names the languages it is for.
 */
const PREPARED_LANGUAGES: readonly TargetLocale[] = ["fr", "de", "es", "ko", "zh", "ja"];
type Section = {
  id: string;
  emoji: string;
  title: string;
  /** Accent for the section's top edge and highlights: one of the shell's named colours. */
  tone: Tone;
  /** Unboxed: the lines sit straight on the page under the app name, with no panel or heading. */
  plain?: boolean;
  lines: Line[];
};

const SECTIONS: Section[] = [
  {
    // Experimental status, AI-written decks and the roadmap, together and unboxed: each topic
    // is down to a line or two, too little to stand alone, so each line keeps its own colour.
    id: "about",
    emoji: "🌿",
    title: "Đôi điều cần biết",
    tone: "mint",
    plain: true,
    lines: [
      {
        emoji: "🧪",
        tone: "citrus",
        text: (
          <>
            chayLá vẫn đang trong giai đoạn <Hl>thử nghiệm</Hl>.
          </>
        ),
      },
      {
        emoji: "🐞",
        tone: "citrus",
        text: (
          <>
            Thỉnh thoảng bạn sẽ gặp <Hl>lỗi nhỏ</Hl> — mong bạn thông cảm nhé.
          </>
        ),
      },
      {
        emoji: "📊",
        tone: "citrus",
        text: (
          <>
            Số đếm trên các emoji hiện chỉ là <Hl>số minh hoạ</Hl>, sẽ chuyển sang{" "}
            <Hl>thống kê thật</Hl> vào thời điểm thích hợp.
          </>
        ),
      },
      {
        emoji: "🤖",
        tone: "cyber",
        text: (
          <>
            Từ vựng, gợi ý và giải nghĩa đều do <Hl>AI tạo ra</Hl>.
          </>
        ),
      },
      {
        emoji: "🚩",
        tone: "cyber",
        text: (
          <>
            Thấy từ nào sai? Bấm <Hl>báo lỗi</Hl> ngay trên thẻ từ đó.
          </>
        ),
      },
      {
        emoji: "📈",
        tone: "mint",
        text: (
          <>
            Nếu chayLá được đón nhận <Hl>vượt mong đợi</Hl>, tính năng mới sẽ lần lượt ra mắt.
          </>
        ),
      },
    ],
  },
  {
    id: "cooperation",
    emoji: "🤝",
    title: "Hợp tác chuyên môn",
    tone: "magenta",
    lines: [
      {
        emoji: "🌏",
        text: (
          <>
            Với các ngôn ngữ <Hl>ngoài tiếng Anh</Hl>, chúng mình rất cần thêm người am hiểu.
          </>
        ),
        chips: PREPARED_LANGUAGES,
      },
      {
        emoji: "🤝",
        text: (
          <>
            Mọi <Hl>đề xuất công tác</Hl> đều được chào đón nồng nhiệt.
          </>
        ),
      },
      {
        emoji: "👩‍🏫",
        text: (
          <>
            <Hl>Giáo viên</Hl>, <Hl>dịch giả</Hl> hay <Hl>người bản xứ</Hl> — ai cũng có thể góp
            sức.
          </>
        ),
      },
    ],
  },
];

/** One row of the pages section: the emoji tile, the title over its caption, an arrow. */
function PageLinkRow({ link }: { link: InfoPageLink }) {
  const body = (
    <>
      <span className="vocab-info-page-icon" aria-hidden="true">
        {link.emoji}
      </span>
      <span className="vocab-info-page-text">
        <strong>{link.title}</strong>
        <small>{link.caption}</small>
      </span>
    </>
  );
  // Off-site (the Facebook Page) opens in a new tab and says so with its arrow.
  if (link.to.startsWith("https://")) {
    return (
      <a className="vocab-info-page" href={link.to} target="_blank" rel="noreferrer">
        {body}
        <ArrowUpRight size={18} aria-hidden="true" />
        <span className="sr-only">(mở trang mới)</span>
      </a>
    );
  }
  return (
    <Link className="vocab-info-page" to={link.to as "/privacy" | "/terms"}>
      {body}
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}

/**
 * The info itself — the app's name, the quick facts, the call for
 * cooperation — without a page around it. The Settings sheet drops it down in place of its
 * own rows, and the standalone page wraps it in a header; both read the same copy.
 * @param props.locale The address's deck locale; it names the site in the hero.
 * @returns The info content.
 */
export function AppInfoContent({ locale = "en" }: { locale?: TargetLocale }) {
  // One running index across the whole page, so the lines arrive one after another top to
  // bottom instead of every section starting its own count at once.
  let order = 0;
  return (
    <div className="vocab-info-content">
      <section className="vocab-info-hero" aria-label="Tóm tắt">
        <span className="vocab-info-hero-leaf" aria-hidden="true">
          🌿
        </span>
        <p className="vocab-info-hero-brand">{siteTitle(locale)}</p>
        <span className="vocab-info-badge" data-tone="citrus">
          🧪 Bản thử nghiệm
        </span>
      </section>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          className="vocab-info-section"
          data-tone={section.tone}
          data-plain={section.plain || undefined}
          aria-label={section.plain ? section.title : undefined}
          aria-labelledby={section.plain ? undefined : `info-${section.id}`}
        >
          {!section.plain && (
            <h2 id={`info-${section.id}`} className="vocab-info-title">
              <span className="vocab-info-title-emoji" aria-hidden="true">
                {section.emoji}
              </span>
              {section.title}
            </h2>
          )}
          <ul className="vocab-info-lines">
            {section.lines.map((line, index) => (
              <li key={index} data-tone={line.tone} style={{ "--i": order++ } as CSSProperties}>
                <span className="vocab-info-emoji" aria-hidden="true">
                  {line.emoji}
                </span>
                <span>
                  {line.text}
                  {line.chips && (
                    <span className="vocab-info-chips">
                      {line.chips.map((locale) => (
                        <span key={locale} className="vocab-info-chip">
                          <span aria-hidden="true">{LANGUAGE_FLAGS[locale]}</span>
                          Tiếng {languageName(locale)}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <nav className="vocab-info-section" data-tone="cyber" aria-labelledby="info-pages">
        <h2 id="info-pages" className="vocab-info-title">
          <span className="vocab-info-title-emoji" aria-hidden="true">
            🧭
          </span>
          Trang thông tin
        </h2>
        <ul className="vocab-info-pages">
          {INFO_PAGE_LINKS.map((link) => (
            <li key={link.id} data-tone={link.tone} style={{ "--i": order++ } as CSSProperties}>
              <PageLinkRow link={link} />
            </li>
          ))}
        </ul>
      </nav>

      <p className="vocab-info-thanks">💚 Cảm ơn bạn đã học cùng chayLá!</p>
    </div>
  );
}

/**
 * Render the app info page for the visited address: the same content as the Settings
 * sheet's drop-down, kept as a page so a shared /feed/about link still opens.
 * @param props.locale The address's deck locale; it names the site in the hero.
 * @returns Public info page.
 */
export function AppInfoPage({ locale = "en" }: { locale?: TargetLocale }) {
  return (
    <main className="vocabulary-shell vocab-info-shell">
      <header className="vocab-library-header">
        <Link className="vocab-icon-button" to="/feed" aria-label="Quay lại dòng từ vựng">
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="vocab-library-title">Thông tin ứng dụng</h1>
          <p className="vocab-library-subtitle">Đôi lời về {siteTitle(locale)} 🌿</p>
        </div>
      </header>

      <div className="vocab-info-body">
        <AppInfoContent locale={locale} />
      </div>
    </main>
  );
}
