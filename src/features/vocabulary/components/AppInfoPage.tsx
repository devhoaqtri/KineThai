/**
 * App info: what chayLá is right now — an experiment, filled with AI-written decks, with new
 * features waiting on how it is received — and an open door for language professionals.
 * Every statement is its own line, led by an emoji, with the words that carry it
 * highlighted, so the page reads in one glance instead of as a wall of paragraphs.
 *
 * Exports: AppInfoPage
 * Depends on: router Link, lucide icons, target-language (brand, locale), useLocale, vocabulary.css
 */

import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { localeCopy, type Locale } from "../lib/locale";
import { DEFAULT_TARGET, isLocaleShown, siteTitle, type TargetLocale } from "../lib/target-language";
import { useLocale } from "../lib/useLocale";
import "../vocabulary.css";

/**
 * Every deck the app serves, in the reader's language. A language withheld from readers
 * (HIDDEN_LOCALES) is left off, as it is in the language drawer: its address only serves
 * the default site, so listing it would promise a deck nobody can open.
 */
const LANGUAGES: { locale: TargetLocale; flag: string; names: Partial<Record<Locale, string>> }[] = (
  [
    { locale: "en", flag: "🇬🇧", names: { vi: "Anh", ja: "英語", th: "อังกฤษ" } },
    { locale: "zh", flag: "🇨🇳", names: { vi: "Hoa", ja: "中国語", th: "จีน" } },
    { locale: "ko", flag: "🇰🇷", names: { vi: "Hàn", ja: "韓国語", th: "เกาหลี" } },
    { locale: "ja", flag: "🇯🇵", names: { vi: "Nhật", ja: "日本語", th: "ญี่ปุ่น" } },
    { locale: "fr", flag: "🇫🇷", names: { vi: "Pháp", ja: "フランス語", th: "ฝรั่งเศส" } },
    { locale: "de", flag: "🇩🇪", names: { vi: "Đức", ja: "ドイツ語", th: "เยอรมัน" } },
    { locale: "es", flag: "🇪🇸", names: { vi: "Tây Ban Nha", ja: "スペイン語", th: "สเปน" } },
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

const SECTIONS_BY_LOCALE: Partial<Record<Locale, Section[]>> = {
  vi: [
    {
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
  ],
  ja: [
    {
      id: "about",
      emoji: "🌿",
      title: "アプリについて",
      tone: "mint",
      plain: true,
      lines: [
        {
          emoji: "🧪",
          tone: "citrus",
          text: (
            <>
              chayLá は現在も<Hl>実験段階</Hl>にあります。
            </>
          ),
        },
        {
          emoji: "🐞",
          tone: "citrus",
          text: (
            <>
              ときどき<Hl>小さな不具合</Hl>が見つかるかもしれません ― ご容赦ください。
            </>
          ),
        },
        {
          emoji: "🤖",
          tone: "cyber",
          text: (
            <>
              語彙、ヒント、解説はすべて <Hl>AI が生成</Hl>しています。
            </>
          ),
        },
        {
          emoji: "🚩",
          tone: "cyber",
          text: (
            <>
              誤りを見つけたら、そのカードからすぐに<Hl>問題を報告</Hl>できます。
            </>
          ),
        },
        {
          emoji: "📈",
          tone: "mint",
          text: (
            <>
              chayLá が<Hl>期待以上に</Hl>受け入れられれば、新しい機能を順次公開していきます。
            </>
          ),
        },
      ],
    },
    {
      id: "cooperation",
      emoji: "🤝",
      title: "専門協力のご案内",
      tone: "magenta",
      lines: [
        {
          emoji: "🌏",
          text: (
            <>
              <Hl>英語以外の言語</Hl>について、詳しい方の協力を求めています。
            </>
          ),
        },
        {
          emoji: "🤝",
          text: (
            <>
              あらゆる<Hl>専門的なご協力</Hl>を心より歓迎します。
            </>
          ),
        },
        {
          emoji: "👩‍🏫",
          text: (
            <>
              <Hl>教師</Hl>、<Hl>翻訳者</Hl>、<Hl>ネイティブスピーカー</Hl> ― どなたでもお力添えいただけます。
            </>
          ),
        },
      ],
    },
  ],
  th: [
    {
      id: "about",
      emoji: "🌿",
      title: "สิ่งที่ควรรู้",
      tone: "mint",
      plain: true,
      lines: [
        {
          emoji: "🧪",
          tone: "citrus",
          text: (
            <>
              chayLá ยังอยู่ในช่วง<Hl>ทดลอง</Hl>
            </>
          ),
        },
        {
          emoji: "🐞",
          tone: "citrus",
          text: (
            <>
              บางครั้งอาจพบ<Hl>ข้อผิดพลาดเล็กน้อย</Hl> — ต้องขออภัยไว้ ณ ที่นี้ด้วยนะ
            </>
          ),
        },
        {
          emoji: "🤖",
          tone: "cyber",
          text: (
            <>
              คำศัพท์ คำใบ้ และคำอธิบายทั้งหมด<Hl>สร้างโดย AI</Hl>
            </>
          ),
        },
        {
          emoji: "🚩",
          tone: "cyber",
          text: (
            <>
              เจอคำไหนผิด? กด<Hl>แจ้งข้อผิดพลาด</Hl>บนการ์ดคำนั้นได้เลย
            </>
          ),
        },
        {
          emoji: "📈",
          tone: "mint",
          text: (
            <>
              หาก chayLá ได้รับการตอบรับ<Hl>เกินความคาดหมาย</Hl> ฟีเจอร์ใหม่ๆ จะทยอยเปิดตัวตามมา
            </>
          ),
        },
      ],
    },
    {
      id: "cooperation",
      emoji: "🤝",
      title: "ความร่วมมือทางวิชาชีพ",
      tone: "magenta",
      lines: [
        {
          emoji: "🌏",
          text: (
            <>
              สำหรับภาษา<Hl>นอกเหนือจากภาษาอังกฤษ</Hl> เรายังต้องการผู้เชี่ยวชาญมาช่วยอีกมาก
            </>
          ),
        },
        {
          emoji: "🤝",
          text: (
            <>
              ยินดีต้อนรับ<Hl>ความร่วมมือทางวิชาชีพ</Hl>ทุกรูปแบบอย่างอบอุ่น
            </>
          ),
        },
        {
          emoji: "👩‍🏫",
          text: (
            <>
              ไม่ว่าจะเป็น<Hl>ครูผู้สอน</Hl> <Hl>นักแปล</Hl> หรือ<Hl>เจ้าของภาษา</Hl> — ทุกคนสามารถร่วมแบ่งปันได้
            </>
          ),
        },
      ],
    },
  ],
};

const PAGE_COPY: Partial<Record<
  Locale,
  {
    backAria: string;
    title: string;
    subtitle: (brand: string) => string;
    heroAria: string;
    badge: string;
    langsAria: string;
    thanks: string;
  }
>> = {
  vi: {
    backAria: "Quay lại dòng từ vựng",
    title: "Thông tin ứng dụng",
    subtitle: (brand) => `Đôi lời về ${brand} 🌿`,
    heroAria: "Tóm tắt",
    badge: "🧪 Bản thử nghiệm",
    langsAria: "Các ngôn ngữ trên chayLá",
    thanks: "💚 Cảm ơn bạn đã học cùng chayLá!",
  },
  ja: {
    backAria: "フィードに戻る",
    title: "アプリ情報",
    subtitle: (brand) => `${brand} について 🌿`,
    heroAria: "概要",
    badge: "🧪 実験版",
    langsAria: "chayLá の対応言語",
    thanks: "💚 chayLá で学んでいただきありがとうございます！",
  },
  th: {
    backAria: "กลับไปที่ฟีดคำศัพท์",
    title: "ข้อมูลแอป",
    subtitle: (brand) => `เกี่ยวกับ ${brand} 🌿`,
    heroAria: "สรุป",
    badge: "🧪 รุ่นทดลอง",
    langsAria: "ภาษาใน chayLá",
    thanks: "💚 ขอบคุณที่เรียนรู้ไปกับ chayLá!",
  },
};

/**
 * The info itself — the app's name and languages, the quick facts, the call for
 * cooperation — without a page around it. The Settings sheet drops it down in place of its
 * own rows, and the standalone page wraps it in a header; both read the same copy.
 * @param props.locale The address's deck locale; its language is marked among the rest.
 * @returns The info content.
 */
export function AppInfoContent({ locale = DEFAULT_TARGET }: { locale?: TargetLocale }) {
  const ui = useLocale();
  const copy = localeCopy(PAGE_COPY, ui);
  const sections = localeCopy(SECTIONS_BY_LOCALE, ui);
  // One running index across the whole page, so the lines arrive one after another top to
  // bottom instead of every section starting its own count at once.
  let order = 0;
  return (
    <div className="vocab-info-content">
      <section className="vocab-info-hero" aria-label={copy.heroAria}>
        <span className="vocab-info-hero-leaf" aria-hidden="true">
          🌿
        </span>
        <p className="vocab-info-hero-brand">{siteTitle(locale)}</p>
        <span className="vocab-info-badge" data-tone="citrus">
          {copy.badge}
        </span>
        <ul className="vocab-info-langs" aria-label={copy.langsAria}>
          {LANGUAGES.map((language) => (
            <li
              key={language.locale}
              data-current={language.locale === locale || undefined}
              aria-current={language.locale === locale ? "true" : undefined}
            >
              <span aria-hidden="true">{language.flag}</span> {localeCopy(language.names, ui)}
            </li>
          ))}
        </ul>
      </section>

      {sections.map((section) => (
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

      <p className="vocab-info-thanks">{copy.thanks}</p>
    </div>
  );
}

/**
 * Render the app info page for the visited address.
 * @param props.locale The address's deck locale; its language is marked among the rest.
 * @returns Public info page.
 */
export function AppInfoPage({ locale = DEFAULT_TARGET }: { locale?: TargetLocale }) {
  const ui = useLocale();
  const copy = localeCopy(PAGE_COPY, ui);
  return (
    <main className="vocabulary-shell vocab-info-shell">
      <header className="vocab-library-header">
        <Link className="vocab-icon-button" to="/feed" aria-label={copy.backAria}>
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="vocab-library-title">{copy.title}</h1>
          <p className="vocab-library-subtitle">{copy.subtitle(siteTitle(locale))}</p>
        </div>
      </header>

      <div className="vocab-info-body">
        <AppInfoContent locale={locale} />
      </div>
    </main>
  );
}
