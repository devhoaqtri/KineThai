/**
 * The site's own pages beyond the feed, and the one public way to reach its owner, in one
 * place: the info page lists them (AppInfoContent), and the privacy and terms pages link the
 * contact. A page added here appears on the info page, in Settings and on /feed/about alike.
 *
 * Exports: CONTACT_URL, InfoPageLink, INFO_PAGE_LINKS
 * Depends on: none (leaf module)
 */

/** The channel's Facebook Page: the public way to reach the owner. */
export const CONTACT_URL = "https://www.facebook.com/1850058198626898";

export type InfoPageLink = {
  id: string;
  emoji: string;
  title: string;
  /** One short line under the title: what the reader finds there. Short enough for one
   *  line in the Settings sheet on a 390px phone. */
  caption: string;
  /** The row's accent, one of the shell's named colours, like the info page's lines. */
  tone: "mint" | "citrus" | "magenta" | "cyber";
  /** An in-app route, or an absolute URL that opens in a new tab. */
  to: "/privacy" | "/terms" | "/store" | `https://${string}`;
};

export const INFO_PAGE_LINKS: readonly InfoPageLink[] = [
  {
    id: "privacy",
    emoji: "🔒",
    title: "Quyền riêng tư",
    caption: "Dữ liệu ở lại máy và dữ liệu gửi đi",
    tone: "mint",
    to: "/privacy",
  },
  {
    id: "terms",
    emoji: "📜",
    title: "Điều khoản sử dụng",
    caption: "Cách dùng trang và nội dung",
    tone: "citrus",
    to: "/terms",
  },
  {
    id: "store",
    emoji: "🛍️",
    title: "Cửa hàng Chay Lá",
    caption: "Các app học ngôn ngữ khác",
    tone: "magenta",
    to: "/store",
  },
  {
    id: "contact",
    emoji: "💬",
    title: "Liên hệ",
    caption: "Trang Facebook Anh.ChayLá",
    tone: "cyber",
    to: CONTACT_URL,
  },
];
