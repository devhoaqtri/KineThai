/**
 * The reader's environment, said plainly when it gets in the way:
 * - offline: shown while the device has no connection, and a short "back online" when it
 *   returns. The words already loaded keep playing; the feed refetches by itself.
 * - storage: shown once per visit when the browser will not let the site keep data
 *   (a private window, site data blocked, some in-app browsers) or its space is full,
 *   because progress, saved words and settings would then vanish without a word.
 * Stacked at the top, under the browser and desktop-mode warnings. Never on the carousel
 * or export pages.
 *
 * Exports: ReaderNotices
 * Depends on: ./ShellNotice, @/lib/storage-probe (type), @/hooks/use-storage-access
 */

import { useEffect, useState } from "react";
import type { StorageState } from "@/lib/storage-probe";
import { useStorageAccess } from "@/hooks/use-storage-access";
import { ShellNotice } from "./ShellNotice";

/** How long "back online" stays up. */
const BACK_ONLINE_MS = 3000;

type Connection = "online" | "offline" | "back";

function excludedPath(): boolean {
  const path = window.location.pathname;
  return path.startsWith("/carousel/") || path.startsWith("/export/");
}

function useConnection(): Connection {
  const [state, setState] = useState<Connection>("online");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      // Only a return from offline is worth saying.
      setState((current) => (current === "offline" ? "back" : current));
      clearTimeout(timer);
      timer = setTimeout(() => setState("online"), BACK_ONLINE_MS);
    };
    if (navigator.onLine === false) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return state;
}

const STORAGE_COPY: Record<Exclude<StorageState, "ok">, { title: string; body: string }> = {
  blocked: {
    title: "Trình duyệt đang chặn lưu dữ liệu",
    body: "Tiến độ học, từ đã lưu và cài đặt của bạn sẽ mất khi đóng trang, và các nút cần lưu trên máy được làm mờ. Hãy tắt chế độ ẩn danh, hoặc cho phép trang lưu dữ liệu (cookie và dữ liệu trang web) trong cài đặt trình duyệt.",
  },
  full: {
    title: "Bộ nhớ của trang đã đầy",
    body: "Trang không lưu thêm được tiến độ học. Xóa bớt bộ từ đã nhập để trang lưu tiếp được.",
  },
};

/** @returns The active notices, or null when there is nothing to say. */
export function ReaderNotices() {
  const connection = useConnection();
  // The shared answer, so a "Thử lại" that works in the storage dialog clears this too.
  const storage = useStorageAccess().state;
  const [storageDismissed, setStorageDismissed] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [excluded, setExcluded] = useState(true);

  useEffect(() => {
    setExcluded(excludedPath());
  }, []);
  // A new loss of connection is news again, even if the last one was dismissed.
  useEffect(() => {
    if (connection === "offline") setOfflineDismissed(false);
  }, [connection]);

  if (excluded) return null;
  const showOffline = connection === "offline" && !offlineDismissed;
  const showBack = connection === "back";
  const showStorage = storage !== "ok" && !storageDismissed;
  if (!showOffline && !showBack && !showStorage) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9989,
        display: "grid",
        gap: "8px",
        padding: "max(12px, env(safe-area-inset-top, 12px)) 12px 0",
        pointerEvents: "none",
      }}
    >
      {showOffline ? (
        <ShellNotice title="Không có kết nối mạng" onDismiss={() => setOfflineDismissed(true)}>
          Các từ đã tải vẫn xem được. Khi có mạng lại, trang sẽ tự tải tiếp.
        </ShellNotice>
      ) : null}
      {showBack ? <ShellNotice tone="ok" title="Đã có mạng lại" /> : null}
      {showStorage ? (
        <ShellNotice
          title={STORAGE_COPY[storage].title}
          onDismiss={() => setStorageDismissed(true)}
        >
          {STORAGE_COPY[storage].body}
        </ShellNotice>
      ) : null}
    </div>
  );
}
