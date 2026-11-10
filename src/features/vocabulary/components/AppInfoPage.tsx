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
import { ArrowLeft } from "lucide-react";
import { isLocaleShown, siteTitle, type TargetLocale } from "../lib/target-language";
import "../vocabulary.css";

/**
 * Every deck the app serves, in the reader's language. A language withheld from readers
 * (HIDDEN_LOCALES) is left off, as it is in the language drawer: its address only serves
 * English, so listing it would promise a deck nobody can open.
 */
const LANGUAGES: { locale: TargetLocale; flag: string; name: string }[] = (
  [
    { locale: "en", flag: "🇬🇧", name: "Anh" },
    { locale: "zh", flag: "🇨🇳", name: "Hoa" },
    { locale: "ko", flag: "🇰🇷", name: "Hàn" },
    { locale: "ja", flag: "🇯🇵", name: "Nhật" },
    { locale: "fr", flag: "🇫🇷", name: "Pháp" },
    { locale: "de", flag: "🇩🇪", name: "Đức" },
    { locale: "es", flag: "🇪🇸", name: "Tây Ban Nha" },
  ] as const
).filter((language) => isLocaleShown(language.locale));

/** The highlighted words of a line; the line's tone, else its section's, picks the colour. */
function Hl({ children }: { children: ReactNode }) {
  return <strong className="vocab-info-hl">{children}</strong>;
}

type Tone = "citrus" | "mint" | "cyber" | "magenta";
/** A line may carry its own tone, so lines gathered from different topics keep their colour. */
type Line = { emoji: string; tone?: Tone; text: ReactNode };
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
      },
      {
        emoji: "🤝",
        text: (
          <>
            Mọi <Hl>hợp tác chuyên môn</Hl> đều được chào đón nồng nhiệt.
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

/**
 * The info itself — the app's name and languages, the quick facts, the call for
 * cooperation — without a page around it. The Settings sheet drops it down in place of its
 * own rows, and the standalone page wraps it in a header; both read the same copy.
 * @param props.locale The address's deck locale; its language is marked among the rest.
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
        <ul className="vocab-info-langs" aria-label="Các ngôn ngữ trên chayLá">
          {LANGUAGES.map((language) => (
            <li
              key={language.locale}
              data-current={language.locale === locale || undefined}
              aria-current={language.locale === locale ? "true" : undefined}
            >
              <span aria-hidden="true">{language.flag}</span> {language.name}
            </li>
          ))}
        </ul>
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
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="vocab-info-thanks">💚 Cảm ơn bạn đã học cùng chayLá!</p>
    </div>
  );
}

/**
 * Render the app info page for the visited address: the same content as the Settings
 * sheet's drop-down, kept as a page so a shared /feed/about link still opens.
 * @param props.locale The address's deck locale; its language is marked among the rest.
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
