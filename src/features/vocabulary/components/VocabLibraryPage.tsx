/**
 * Vocabulary Library: where a reader uploads their own word pack, above a browsable shelf
 * of additional packs, each focused on a field, a need and a proficiency band. The shelf
 * reads static mock metadata from ../lib/library — no account, no network, no feed wiring
 * yet, so every pack is marked "Sắp có" — and is hidden while LIBRARY_PACKS_AVAILABLE is
 * off, leaving the page to the upload alone.
 *
 * Exports: VocabLibraryPage
 * Depends on: router Link, lucide icons, library data, formatLevelBand, feature flags,
 *   vocabulary.css
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft, Library as LibraryIcon, Sparkles } from "lucide-react";
import { LIBRARY_PACKS_AVAILABLE } from "@/lib/feature-flags";
import { LIBRARY_GROUPS } from "../lib/library";
import { formatLevelBand } from "../lib/difficulty";
import { ImportPackPanel } from "./ImportPackPanel";
import { StorageAccessDialog } from "./StorageAccessDialog";
import "../vocabulary.css";

/** Show the pack upload, and the curated shelves when they are on. @returns Public library page. */
export function VocabLibraryPage() {
  return (
    <main className="vocabulary-shell vocab-library-shell">
      <header className="vocab-library-header">
        <Link className="vocab-icon-button" to="/feed" aria-label="Quay lại dòng từ vựng">
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="vocab-library-title">
            <LibraryIcon size={20} aria-hidden="true" />
            Thư viện từ vựng
          </h1>
          <p className="vocab-library-subtitle">
            {LIBRARY_PACKS_AVAILABLE
              ? "Những gói từ vựng chuyên sâu theo lĩnh vực, nhu cầu và trình độ — bổ sung cho dòng ngẫu nhiên hằng ngày."
              : "Tải lên bộ từ vựng của riêng bạn."}
          </p>
        </div>
      </header>

      <div className="vocab-library-body">
        <ImportPackPanel />
        <StorageAccessDialog />
        {(LIBRARY_PACKS_AVAILABLE ? LIBRARY_GROUPS : []).map((group) => (
          <section
            className="vocab-library-group"
            key={group.id}
            aria-labelledby={`grp-${group.id}`}
          >
            <div className="vocab-library-group-head">
              <h2 id={`grp-${group.id}`} className="vocab-library-group-title">
                {group.title}
              </h2>
              <p className="vocab-library-group-note">{group.note}</p>
            </div>
            <ul className="vocab-library-grid">
              {group.packs.map((pack) => (
                <li className="vocab-library-pack" key={pack.id}>
                  <div className="vocab-pack-top">
                    <span className="vocab-pack-band">{formatLevelBand(pack.levels)}</span>
                    <span className="vocab-pack-soon">
                      <Sparkles size={12} aria-hidden="true" />
                      Sắp có
                    </span>
                  </div>
                  <h3 className="vocab-pack-name">{pack.name}</h3>
                  <p className="vocab-pack-blurb">{pack.blurb}</p>
                  <ul className="vocab-pack-tags">
                    {pack.tags.map((tag) => (
                      <li className="vocab-pack-tag" key={tag}>
                        {tag}
                      </li>
                    ))}
                  </ul>
                  <p className="vocab-pack-count">~{pack.words.toLocaleString()} từ</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
