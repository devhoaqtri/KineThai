/**
 * Which reader features need on-device storage, and what to say when it is off.
 *
 * Everything a reader keeps lives in local storage: saved and loved words, the streak and
 * its medals, the history the memory cells review, and imported packs. When the browser
 * refuses to store anything (a private window, site data blocked, some in-app browsers),
 * those controls cannot do their job, so they are greyed out and a tap explains why instead
 * of failing silently. When storage is only full, reading still works, so only the
 * controls that write are greyed out. Settings (level, theme, sound) still work for the
 * visit and are simply forgotten on reload, so they are never greyed out.
 *
 * Exports: StorageFeature, STORAGE_FEATURES, isStorageFeatureOff, storageDialogCopy,
 *   storageHelpSteps
 * Depends on: @/lib/storage-probe (type only)
 */

import type { StorageState } from "@/lib/storage-probe";

/** "keep" is not a control: it explains a browser that will not keep the data for good. */
export type StorageFeature = "save" | "saved" | "memory" | "import" | "keep";

export const STORAGE_FEATURES: Record<
  Exclude<StorageFeature, "keep">,
  { writes: boolean; name: string; why: string }
> = {
  save: {
    writes: true,
    name: "Yêu thích và lưu từ",
    why: "Nút tim và nút lưu ghi từ vào bộ nhớ trên máy bạn, nên lúc này chưa bấm được.",
  },
  saved: {
    writes: false,
    name: "Từ đã lưu",
    why: "Từ đã lưu, chuỗi ngày học và huy hiệu đều nằm trên máy bạn, nên lúc này chưa mở được.",
  },
  memory: {
    writes: false,
    name: "Ôn lại từ đã xem",
    why: "Lịch sử từ đã xem nằm trên máy bạn, nên lúc này chưa có gì để ôn lại.",
  },
  import: {
    writes: true,
    name: "Thêm gói từ",
    why: "Gói từ bạn tự nhập chỉ được giữ trên máy bạn, nên lúc này chưa nhập được.",
  },
};

/**
 * @param feature - the control's feature
 * @param state - what the browser allows
 * @returns Whether the control is greyed out
 * @pure true
 */
export function isStorageFeatureOff(
  feature: Exclude<StorageFeature, "keep">,
  state: StorageState,
): boolean {
  if (state === "blocked") return true;
  if (state === "full") return STORAGE_FEATURES[feature].writes;
  return false;
}

/**
 * The dialog's title and lines for a feature in the browser's current state.
 * @param feature - what was tapped
 * @param state - what the browser allows
 * @returns Title, the reason, and what still works
 * @pure true
 */
export function storageDialogCopy(
  feature: StorageFeature,
  state: StorageState,
): { title: string; reason: string; still: string } {
  if (feature === "keep") {
    return {
      title: "Trình duyệt chưa cho giữ dữ liệu lâu dài",
      reason:
        "Tiến độ, từ đã lưu và chuỗi ngày học vẫn được ghi, nhưng trình duyệt có thể tự xoá khi máy thiếu bộ nhớ.",
      still: "Cho phép lưu lâu dài để giữ chúng an toàn.",
    };
  }
  const why = feature in STORAGE_FEATURES ? STORAGE_FEATURES[feature].why : "";
  if (state === "full") {
    return {
      title: "Bộ nhớ của trang đã đầy",
      reason: why,
      still: "Xoá bớt gói từ đã nhập (Chọn cấp độ → Gói của bạn), rồi bấm Thử lại.",
    };
  }
  return {
    title: "Trình duyệt đang chặn lưu dữ liệu",
    reason: why,
    still: "Bạn vẫn học từ bình thường, nhưng cài đặt và tiến độ sẽ mất khi đóng trang.",
  };
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Zalo|TikTok|musical_ly|BytedanceWebview|Line\/|Messenger/i;

/**
 * How to let the site keep data, for the browser the reader is in. Browsers have no
 * prompt a site can raise again for this, so the steps are the reader's to take.
 * @param userAgent - navigator.userAgent
 * @param feature - "keep" explains persistence; anything else, storage being blocked
 * @returns Steps, most likely first
 * @pure true
 */
export function storageHelpSteps(userAgent: string, feature: StorageFeature): string[] {
  const firefox = /Firefox|FxiOS/i.test(userAgent);
  if (feature === "keep") {
    return firefox
      ? [
          "Bấm biểu tượng ổ khoá cạnh địa chỉ trang → Quyền → “Lưu trữ dữ liệu bền vững” → Cho phép.",
        ]
      : ["Thêm trang vào màn hình chính hoặc dấu trang, để trình duyệt giữ dữ liệu lâu dài."];
  }
  const steps: string[] = [];
  if (IN_APP.test(userAgent)) {
    steps.push("Đang mở trong ứng dụng khác (Zalo, Facebook, TikTok…)? Mở trang bằng Chrome hoặc Safari.");
  }
  steps.push("Đang ở tab ẩn danh? Mở trang trong một tab thường.");
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || /Macintosh.*Mobile/i.test(userAgent);
  if (ios && !firefox && !/CriOS/i.test(userAgent)) {
    steps.push("iPhone, iPad: Cài đặt → Safari → tắt “Chặn tất cả cookie”.");
  } else if (firefox) {
    steps.push("Firefox: bấm ổ khoá cạnh địa chỉ trang → cho phép cookie và dữ liệu trang web.");
  } else {
    steps.push(
      "Chrome: ⋮ → Cài đặt → Cài đặt trang web → Cookie và dữ liệu trang web → cho phép trang này.",
    );
  }
  return steps;
}
