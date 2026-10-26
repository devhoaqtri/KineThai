/**
 * App info: what chayLá is right now — an experiment, filled with AI-written decks in every
 * language, with a roadmap that waits on how it is received and an open door for language
 * professionals. Every statement is its own line, led by an emoji, with the words that carry
 * it highlighted, so the page reads in one glance instead of as a wall of paragraphs.
 *
 * Exports: AppInfoPage
 * Depends on: router Link, lucide icons, target-language (brand, locale), vocabulary.css
 */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { siteTitle, type TargetLocale } from "../lib/target-language";
import "../vocabulary.css";

/** Every deck the app serves, in the reader's language, with the address that serves it. */
const LANGUAGES: { locale: TargetLocale; flag: string; name: string }[] = [
  { locale: "en", flag: "🇬🇧", name: "Anh" },
  { locale: "zh", flag: "🇨🇳", name: "Hoa" },
  { locale: "ko", flag: "🇰🇷", name: "Hàn" },
  { locale: "ja", flag: "🇯🇵", name: "Nhật" },
  { locale: "fr", flag: "🇫🇷", name: "Pháp" },
  { locale: "de", flag: "🇩🇪", name: "Đức" },
  { locale: "es", flag: "🇪🇸", name: "Tây Ban Nha" },
];

/** The highlighted words of a line; the section's tone picks the colour. */
function Hl({ children }: { children: ReactNode }) {
  return <strong className="vocab-info-hl">{children}</strong>;
}

type Line = { emoji: string; text: ReactNode };
type Section = {
  id: string;
  emoji: string;
  title: string;
  /** Accent for the section's badge and highlights: one of the shell's named colours. */
  tone: "citrus" | "mint" | "cyber" | "magenta";
  lines: Line[];
};

const SECTIONS: Section[] = [
  {
    id: "experimental",
    emoji: "🧪",
    title: "Đang thử nghiệm",
    tone: "citrus",
    lines: [
      {
        emoji: "🧪",
        text: (
          <>
            chayLá vẫn đang trong giai đoạn <Hl>thử nghiệm</Hl>.
          </>
        ),
      },
      {
        emoji: "🛠️",
        text: (
          <>
            Giao diện và tính năng có thể <Hl>thay đổi</Hl> bất cứ lúc nào.
          </>
        ),
      },
      {
        emoji: "🐞",
        text: (
          <>
            Thỉnh thoảng bạn sẽ gặp <Hl>lỗi nhỏ</Hl> — mong bạn thông cảm nhé.
          </>
        ),
      },
      {
        emoji: "💾",
        text: (
          <>
            Lịch sử và từ đã lưu chỉ nằm <Hl>trên thiết bị này</Hl>.
          </>
        ),
      },
    ],
  },
  {
    id: "ai",
    emoji: "🤖",
    title: "Nội dung do AI tạo",
    tone: "cyber",
    lines: [
      {
        emoji: "🤖",
        text: (
          <>
            Từ vựng, gợi ý và giải nghĩa đều do <Hl>AI tạo ra</Hl>.
          </>
        ),
      },
      {
        emoji: "🌍",
        text: (
          <>
            Điều này đúng với <Hl>mọi ngôn ngữ</Hl> trên chayLá, không riêng ngôn ngữ nào.
          </>
        ),
      },
      {
        emoji: "🚩",
        text: (
          <>
            Thấy từ nào sai? Bấm <Hl>báo lỗi</Hl> ngay trên thẻ từ đó.
          </>
        ),
      },
    ],
  },
  {
    id: "roadmap",
    emoji: "🚀",
    title: "Lộ trình phía trước",
    tone: "mint",
    lines: [
      {
        emoji: "📈",
        text: (
          <>
            Nếu chayLá được đón nhận <Hl>vượt mong đợi</Hl>, tính năng mới sẽ lần lượt ra mắt.
          </>
        ),
      },
      {
        emoji: "📚",
        text: (
          <>
            Sắp tới: <Hl>gói từ vựng chuyên sâu</Hl> theo lĩnh vực và trình độ.
          </>
        ),
      },
      {
        emoji: "👥",
        text: (
          <>
            Một <Hl>cộng đồng</Hl> để cùng học và chia sẻ từ vựng.
          </>
        ),
      },
      {
        emoji: "🧩",
        text: (
          <>
            Thêm nhiều <Hl>app anh em</Hl> trong hệ sinh thái Chay Lá.
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
      {
        emoji: "⚡",
        text: (
          <>
            Mỗi góp ý chuyên môn sẽ được <Hl>cập nhật ngay</Hl> vào bộ từ.
          </>
        ),
      },
    ],
  },
];

/**
 * Render the app info page for the visited address.
 * @param props.locale The address's deck locale; its language is marked among the rest.
 * @returns Public info page.
 */
export function AppInfoPage({ locale = "en" }: { locale?: TargetLocale }) {
  // One running index across the whole page, so the lines arrive one after another top to
  // bottom instead of every section starting its own count at once.
  let order = 0;
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
            aria-labelledby={`info-${section.id}`}
          >
            <h2 id={`info-${section.id}`} className="vocab-info-title">
              <span className="vocab-info-title-emoji" aria-hidden="true">
                {section.emoji}
              </span>
              {section.title}
            </h2>
            <ul className="vocab-info-lines">
              {section.lines.map((line, index) => (
                <li key={index} style={{ "--i": order++ } as CSSProperties}>
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
    </main>
  );
}
