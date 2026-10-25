/**
 * The reader's imported packs, as cards under the library's import row: what each pack
 * holds (word count, levels, where it came from), a peek at its first words, and what can
 * be done with it — play or stop it, look through every word, download it again, delete it.
 *
 * Deleting is two taps: the first turns the button into a confirmation, which lapses on its
 * own, so a stray tap never throws a pack away.
 *
 * Exports: ImportedPackList
 * Depends on: router navigate, lucide icons, ../lib/custom-pack, ../lib/difficulty,
 *   ../lib/word-joiner, ./PackPreviewDialog
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Eye, FileJson, Link2, Play, Square, Trash2 } from "lucide-react";
import {
  activateCustomPack,
  packLevelCounts,
  removeCustomPack,
  type CustomPack,
} from "../lib/custom-pack";
import { formatLevelBand } from "../lib/difficulty";
import type { VocabularyLevel } from "../lib/schema";
import { stripWordJoiners } from "../lib/word-joiner";
import { PackPreviewDialog } from "./PackPreviewDialog";

/** Words shown in a card's peek before "và N từ nữa". */
const PEEK = 6;
/** How long a delete waits for its confirming tap. */
const CONFIRM_MS = 3500;

/** Where a pack came from, short: the file's name, whether uploaded or linked (the link's
 * host when its path names no file). The full source stays in the tooltip. */
function sourceLabel(source: string): { label: string; link: boolean } {
  try {
    const url = new URL(source);
    if (/^https?:$/.test(url.protocol)) {
      const file = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      return { label: file || url.host, link: true };
    }
  } catch {
    // Not a URL: a file name.
  }
  return { label: source.split(/[/\\]/).pop() ?? source, link: false };
}

/** The pack as a file again: the shape the importer reads, named after the pack. */
function downloadPack(pack: CustomPack): void {
  const body = JSON.stringify({ name: pack.catalog.name, words: pack.catalog.words }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  const slug =
    pack.catalog.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "goi-tu-vung";
  link.download = `${slug}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function PackCard({ pack, active, fresh }: { pack: CustomPack; active: boolean; fresh: boolean }) {
  const navigate = useNavigate();
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const card = useRef<HTMLLIElement>(null);
  const { catalog } = pack;
  const levels = packLevelCounts(pack);
  const named = levels.filter((entry) => entry.level).map((entry) => entry.level);
  const band = named.length ? formatLevelBand(named as VocabularyLevel[]) : null;
  const source = sourceLabel(pack.source);
  const imported = new Date(pack.importedAt).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const peek = catalog.words.slice(0, PEEK);
  const more = catalog.count - peek.length;

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  // A pack that just arrived is brought into view, so the reader sees where it landed.
  useEffect(() => {
    if (fresh) card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [fresh]);

  const play = () => {
    activateCustomPack(pack.id);
    void navigate({ to: "/feed" });
  };

  return (
    <li
      ref={card}
      className="vocab-pack-card"
      data-active={active || undefined}
      data-fresh={fresh || undefined}
      aria-label={`${catalog.name}, ${catalog.count} từ${active ? ", đang phát" : ""}`}
    >
      <div className="vocab-pack-card-head">
        <FileJson size={18} aria-hidden="true" />
        <h3>{catalog.name}</h3>
        {active && <span className="vocab-pack-card-badge">Đang phát</span>}
        {fresh && !active && (
          <span className="vocab-pack-card-badge" data-fresh>
            Mới thêm
          </span>
        )}
      </div>
      <p className="vocab-pack-card-meta">
        <span>{catalog.count.toLocaleString("vi-VN")} từ</span>
        {band && <span>{band}</span>}
        <span className="vocab-pack-card-source" title={pack.source}>
          {source.link ? <Link2 size={12} aria-hidden="true" /> : null}
          {source.label}
        </span>
        <span>nhập {imported}</span>
      </p>
      {levels.length > 1 && (
        <ul className="vocab-pack-card-levels" aria-label="Số từ theo trình độ">
          {levels.map((entry) => (
            <li key={entry.level || "none"}>
              <span>{entry.level || "Khác"}</span>
              {entry.count}
            </li>
          ))}
        </ul>
      )}
      <ul className="vocab-pack-card-peek" aria-label="Vài từ đầu tiên">
        {peek.map((word) => (
          <li key={word.id}>
            <strong lang="en">{word.word}</strong>
            <span>{stripWordJoiners(word.meaningVi ?? word.defVi)}</span>
          </li>
        ))}
        {more > 0 && (
          <li className="vocab-pack-card-more">
            <button type="button" onClick={() => setLooking(true)}>
              và {more.toLocaleString("vi-VN")} từ nữa
            </button>
          </li>
        )}
      </ul>
      <div className="vocab-pack-card-actions">
        {active ? (
          <button
            type="button"
            className="vocab-import-btn"
            onClick={() => activateCustomPack(null)}
          >
            <Square size={13} aria-hidden="true" /> Dừng
          </button>
        ) : (
          <button type="button" className="vocab-import-btn" onClick={play}>
            <Play size={14} aria-hidden="true" /> Phát
          </button>
        )}
        <button
          type="button"
          className="vocab-import-btn ghost"
          aria-haspopup="dialog"
          onClick={() => setLooking(true)}
        >
          <Eye size={14} aria-hidden="true" /> Xem nhanh
        </button>
        <button
          type="button"
          className="vocab-import-btn ghost"
          onClick={() => downloadPack(pack)}
          aria-label={`Tải xuống ${catalog.name}`}
        >
          <Download size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="vocab-import-btn ghost vocab-pack-card-delete"
          data-confirming={confirming || undefined}
          onClick={() => (confirming ? removeCustomPack(pack.id) : setConfirming(true))}
          aria-label={confirming ? `Chắc chắn xóa ${catalog.name}` : `Xóa ${catalog.name}`}
        >
          <Trash2 size={14} aria-hidden="true" />
          {confirming && " Xóa thật?"}
        </button>
      </div>
      {looking && (
        <PackPreviewDialog
          file={{
            name: source.label,
            text: JSON.stringify({ name: catalog.name, words: catalog.words }),
          }}
          open={looking}
          onOpenChange={setLooking}
          importLabel={active ? "Đang phát" : "Phát gói này"}
          onImport={() => {
            setLooking(false);
            if (!active) play();
          }}
        />
      )}
    </li>
  );
}

/**
 * @param packs The imported packs, newest first
 * @param active The playing pack's id, or null
 * @param fresh The id of a pack that was just added, to highlight
 */
export function ImportedPackList({
  packs,
  active,
  fresh,
}: {
  packs: CustomPack[];
  active: string | null;
  fresh: string | null;
}) {
  if (!packs.length) return null;
  return (
    <section className="vocab-pack-list" aria-labelledby="vocab-pack-list-title">
      <h3 id="vocab-pack-list-title" className="vocab-pack-list-title">
        Gói đã nhập · {packs.length}
      </h3>
      <ul>
        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            active={pack.id === active}
            fresh={pack.id === fresh}
          />
        ))}
      </ul>
    </section>
  );
}
