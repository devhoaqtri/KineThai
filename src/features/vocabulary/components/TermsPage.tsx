/**
 * The terms of use: Vietnamese first, for the readers, then the same in English. Static copy;
 * the brand follows the visited address. Keep it true to the product and to the app info
 * page (AppInfoPage): free, a beta whose words, clues and meanings are AI-drafted and then
 * edited, imported packs stay on the reader's device (lib/custom-pack), reports are
 * anonymous, automated copying is refused (lib/bot-gate, lib/bot-signals). Privacy lives on
 * its own page (PrivacyPage).
 *
 * Exports: TermsPage
 * Depends on: router Link, lucide icons, target-language (brand), vocabulary.css
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { siteTitle, type TargetLocale } from "../lib/target-language";
import { CONTACT_URL } from "../lib/site-links";
import "../vocabulary.css";

/** When the terms last changed, as shown on the page. */
const TERMS_UPDATED = { vi: "21/11/2026", en: "21 November 2026" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="vocab-info-section vocab-privacy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Contact({ children }: { children: ReactNode }) {
  return (
    <a href={CONTACT_URL} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * @param props.locale - the address's deck locale; it names the site
 * @returns The terms of use page
 */
export function TermsPage({ locale = "en" }: { locale?: TargetLocale }) {
  const brand = siteTitle(locale);
  return (
    <main className="vocabulary-shell vocab-info-shell vocab-privacy">
      <header className="vocab-library-header">
        <Link className="vocab-icon-button" to="/feed" aria-label="Quay lại dòng từ vựng">
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="vocab-library-title">Điều khoản sử dụng</h1>
          <p className="vocab-library-subtitle">
            {brand} · cập nhật {TERMS_UPDATED.vi}
          </p>
        </div>
      </header>

      <div className="vocab-info-body">
        <Section title="Tóm tắt">
          <p>
            {brand} là trang học từ vựng miễn phí. Khi dùng trang, bạn đồng ý với các điều khoản
            dưới đây. Cách chúng tôi xử lý dữ liệu nằm ở{" "}
            <Link to="/privacy">Chính sách quyền riêng tư</Link>.
          </p>
        </Section>

        <Section title="Dùng trang thế nào">
          <ul>
            <li>Trang dành cho việc học của cá nhân bạn.</li>
            <li>
              Không dùng công cụ tự động để tải hoặc sao chép hàng loạt nội dung, không làm quá tải
              máy chủ và không gửi báo cáo giả. Những yêu cầu như vậy sẽ bị chặn.
            </li>
          </ul>
        </Section>

        <Section title="Nội dung">
          <ul>
            <li>
              Từ vựng, gợi ý, câu ví dụ và hình thẻ trên trang thuộc về {brand}. Bạn có thể chia sẻ
              liên kết đến một từ, nhưng không sao chép lại nội dung để phát hành nơi khác.
            </li>
            <li>
              Đây là bản thử nghiệm. Từ vựng, gợi ý và giải nghĩa do AI soạn rồi được biên tập lại,
              nên vẫn có thể còn sai sót. Thấy chỗ nào sai, bạn bấm nút 😕 trên thẻ để báo cho chúng
              tôi.
            </li>
            <li>Trang giúp bạn ôn từ, không thay thế giáo viên hay tài liệu chính thức.</li>
          </ul>
        </Section>

        <Section title="Bộ từ bạn tự nhập">
          <p>
            Bộ từ bạn nhập chỉ nằm trên máy của bạn và không được gửi lên máy chủ. Bạn tự chịu trách
            nhiệm về quyền dùng nội dung trong đó.
          </p>
        </Section>

        <Section title="Không bảo đảm">
          <p>
            Trang được cung cấp như hiện có và có thể thay đổi, tạm dừng hoặc ngừng bất cứ lúc nào.
            Tiến độ học lưu trên máy bạn sẽ mất khi bạn xóa dữ liệu trình duyệt. Trong phạm vi pháp
            luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại phát sinh từ việc dùng
            trang.
          </p>
        </Section>

        <Section title="Thay đổi và luật áp dụng">
          <p>
            Khi điều khoản thay đổi, chúng tôi cập nhật trang này và ngày cập nhật ở đầu trang. Điều
            khoản này tuân theo pháp luật Việt Nam.
          </p>
        </Section>

        <Section title="Liên hệ">
          <p>
            Câu hỏi về điều khoản: nhắn cho <Contact>Trang Facebook Anh.ChayLá</Contact>.
          </p>
        </Section>

        <hr className="vocab-privacy-divider" />
        <h2 className="vocab-library-title vocab-privacy-lang" lang="en">
          Terms of use (English)
        </h2>

        <div lang="en">
          <Section title="Summary">
            <p>
              {brand} is a free vocabulary learning site. By using it you agree to these terms. How
              we handle data is set out in the <Link to="/privacy">Privacy policy</Link>.
            </p>
          </Section>

          <Section title="Using the site">
            <ul>
              <li>The site is for your own personal learning.</li>
              <li>
                Do not use automated tools to download or copy content in bulk, overload the server
                or file false reports. Such requests are blocked.
              </li>
            </ul>
          </Section>

          <Section title="Content">
            <ul>
              <li>
                The words, clues, example sentences and card images belong to {brand}. You may share
                links to a word, but not republish the content elsewhere.
              </li>
              <li>
                This is a beta. The words, clues and meanings are drafted by AI and then edited, so
                mistakes are still possible. If you spot one, tap the 😕 button on the card to tell
                us.
              </li>
              <li>The site helps you practise words; it is not a substitute for a teacher.</li>
            </ul>
          </Section>

          <Section title="Word packs you import">
            <p>
              Packs you import stay on your device and are never sent to our server. You are
              responsible for your right to use their content.
            </p>
          </Section>

          <Section title="No warranty">
            <p>
              The site is provided as is and may change, pause or stop at any time. Progress kept on
              your device is lost if you clear your browser's data. To the extent the law allows, we
              are not liable for damages arising from your use of the site.
            </p>
          </Section>

          <Section title="Changes and governing law">
            <p>
              When these terms change, we update this page and the date at its top. These terms are
              governed by the laws of Vietnam.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these terms: message the <Contact>Anh.ChayLá Facebook Page</Contact>.
              Last updated {TERMS_UPDATED.en}.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
