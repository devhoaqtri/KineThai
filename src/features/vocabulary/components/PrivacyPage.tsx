/**
 * The privacy policy: what the site keeps on the reader's own device, the little it sends to
 * the server, and how the channel's own publishing tool uses YouTube's API. Vietnamese first,
 * for the readers, then the same in English, for Google's reviewers of that tool
 * (docs/youtube-publishing.md). Static copy; the brand follows the visited address.
 *
 * Keep it true to the code: storage is the browser's (progress, history, settings, imported
 * packs), word reports keep only a salted one-way digest (reporter-digest.server.ts), visitor
 * telemetry is a random session id with page health and errors (visitor-telemetry.server.ts),
 * hearts and bookmarks are totals only (engagement.server.ts). Change this page when they change.
 *
 * Exports: PrivacyPage, PRIVACY_UPDATED
 * Depends on: router Link, lucide icons, target-language (brand), vocabulary.css
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { siteTitle, type TargetLocale } from "../lib/target-language";
import "../vocabulary.css";

/** When the policy last changed, as shown on the page. */
export const PRIVACY_UPDATED = { vi: "17/11/2026", en: "17 November 2026" };

/** The channel's Facebook Page: the public way to reach the owner. */
const CONTACT_URL = "https://www.facebook.com/1850058198626898";

const LINKS = {
  youtubeTerms: "https://www.youtube.com/t/terms",
  googlePrivacy: "https://policies.google.com/privacy",
  googlePermissions: "https://myaccount.google.com/permissions",
};

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="vocab-info-section vocab-privacy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPage({ locale = "en" }: { locale?: TargetLocale }) {
  const brand = siteTitle(locale);
  return (
    <main className="vocabulary-shell vocab-info-shell vocab-privacy">
      <header className="vocab-library-header">
        <Link className="vocab-icon-button" to="/feed" aria-label="Quay lại dòng từ vựng">
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="vocab-library-title">Chính sách quyền riêng tư</h1>
          <p className="vocab-library-subtitle">
            {brand} · cập nhật {PRIVACY_UPDATED.vi}
          </p>
        </div>
      </header>

      <div className="vocab-info-body">
        <Section title="Tóm tắt">
          <p>
            {brand} là trang học từ vựng. Bạn dùng được mà không cần tài khoản. Tiến độ học nằm trên
            máy của bạn; máy chủ chỉ nhận vài số liệu ẩn danh để trang chạy ổn định. Chúng tôi không
            bán dữ liệu, không chạy quảng cáo và không dùng công cụ theo dõi của bên thứ ba.
          </p>
        </Section>

        <Section title="Lưu trên máy của bạn">
          <ul>
            <li>Trình độ bạn chọn, các từ đã xem, từ đã lưu, cài đặt và các gói từ bạn tự nhập.</li>
            <li>
              Những dữ liệu này nằm trong bộ nhớ trình duyệt (localStorage) và không được gửi đi.
              Xóa dữ liệu trang web trong trình duyệt là xóa hết.
            </li>
          </ul>
        </Section>

        <Section title="Gửi về máy chủ">
          <ul>
            <li>
              Số liệu kỹ thuật ẩn danh: một mã phiên ngẫu nhiên, trang có tải được không và lỗi nếu
              có. Không kèm tên, email hay danh tính.
            </li>
            <li>Lượt thả tim và lượt lưu: chỉ lưu tổng số của mỗi từ, không lưu ai đã bấm.</li>
            <li>
              Báo lỗi một từ: chỉ lưu một mã băm một chiều của địa chỉ mạng, trộn riêng theo từng
              từ, đủ để đếm số người báo mà không thể biết bạn là ai hay bạn đã xem những từ nào.
            </li>
            <li>
              Như mọi trang web, nhà cung cấp hạ tầng có thể ghi nhật ký truy cập kỹ thuật (ví dụ
              địa chỉ IP, trình duyệt) trong thời gian ngắn để vận hành và chống lạm dụng.
            </li>
          </ul>
        </Section>

        <Section title="Đăng nhập">
          <p>
            Đăng nhập là không bắt buộc. Nếu bạn đăng nhập bằng Google, chúng tôi nhận tên và email
            từ Google chỉ để nhận ra tài khoản của bạn, và không dùng chúng vào việc gì khác.
          </p>
        </Section>

        <Section title="Công cụ đăng bài của kênh">
          <p>
            {brand} tự đăng video học từ của chính mình lên kênh YouTube, Trang Facebook và tài
            khoản Instagram Anh.ChayLá bằng một công cụ nội bộ (“Anh ChayLa Poster”). Công cụ này
            dùng Dịch vụ API của YouTube chỉ để tải video của chủ kênh lên kênh của chính chủ kênh.
            Nó không đọc, lưu hay chia sẻ dữ liệu của bất kỳ người dùng YouTube nào khác, và mã truy
            cập chỉ được giữ trên máy tính của chủ kênh.
          </p>
          <p>
            Khi dùng tính năng liên quan đến YouTube, bạn đồng ý với{" "}
            <External href={LINKS.youtubeTerms}>Điều khoản dịch vụ của YouTube</External>; Google xử
            lý dữ liệu theo{" "}
            <External href={LINKS.googlePrivacy}>Chính sách quyền riêng tư của Google</External>. Có
            thể thu hồi quyền truy cập bất cứ lúc nào tại{" "}
            <External href={LINKS.googlePermissions}>
              trang quyền truy cập tài khoản Google
            </External>
            .
          </p>
        </Section>

        <Section title="Liên hệ">
          <p>
            Câu hỏi về quyền riêng tư hoặc yêu cầu xóa dữ liệu: nhắn cho{" "}
            <External href={CONTACT_URL}>Trang Facebook Anh.ChayLá</External>.
          </p>
        </Section>

        <hr className="vocab-privacy-divider" />

        <h2 className="vocab-library-title vocab-privacy-lang" lang="en">
          Privacy policy (English)
        </h2>
        <div lang="en">
          <Section title="Summary">
            <p>
              {brand} is a vocabulary learning site you can use without an account. Your learning
              progress stays on your device; the server receives only a little anonymous data to
              keep the site running. We do not sell data, show ads or use third-party trackers.
            </p>
          </Section>

          <Section title="Kept on your device">
            <p>
              Your chosen level, the words you have seen, saved words, settings and any word packs
              you import are kept in your browser's storage (localStorage) and are never sent to us.
              Clearing the site's data in your browser removes them.
            </p>
          </Section>

          <Section title="Sent to the server">
            <ul>
              <li>
                Anonymous technical data: a random session id, whether pages loaded, and errors. No
                name, email or identity.
              </li>
              <li>Hearts and bookmarks: only each word's totals, never who tapped.</li>
              <li>
                Word reports: only a one-way, per-word salted digest of the network address, enough
                to count distinct reporters without learning who you are or which words you viewed.
              </li>
              <li>
                Like any website, our hosting providers may keep short-lived technical access logs
                (such as IP address and browser) to run the service and prevent abuse.
              </li>
            </ul>
          </Section>

          <Section title="Signing in">
            <p>
              Signing in is optional. If you sign in with Google, we receive your name and email
              from Google only to recognise your account, and use them for nothing else.
            </p>
          </Section>

          <Section title="The channel's publishing tool">
            <p>
              {brand} publishes its own vocabulary videos to its own YouTube channel, Facebook Page
              and Instagram account (Anh.ChayLá) with an internal tool, “Anh ChayLa Poster”. The
              tool uses YouTube API Services only to upload the channel owner's videos to the
              owner's own channel. It does not access, store or share data about any other YouTube
              user, and its access token is kept only on the owner's computer.
            </p>
            <p>
              By using YouTube features you agree to the{" "}
              <External href={LINKS.youtubeTerms}>YouTube Terms of Service</External>. Google
              handles data under the{" "}
              <External href={LINKS.googlePrivacy}>Google Privacy Policy</External>. Access can be
              revoked at any time from your{" "}
              <External href={LINKS.googlePermissions}>Google Account permissions page</External>.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Privacy questions or data deletion requests: message the{" "}
              <External href={CONTACT_URL}>Anh.ChayLá Facebook Page</External>. Last updated{" "}
              {PRIVACY_UPDATED.en}.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
