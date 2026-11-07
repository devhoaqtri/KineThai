/**
 * The ecosystem store: every Chay Lá app with its screenshots and description.
 *
 * The screenshot frames are MOCK — no real captures exist yet, so each frame is
 * drawn from the app's own accent and glyph and captioned with what it would
 * show. Swap the frame body for an <img> when the real art lands; the caption
 * and layout stay.
 *
 * Exports: StorePage
 * Depends on: router Link, ecosystem app data, store.css
 */

import type React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ECOSYSTEM_APPS, type EcosystemApp } from "../data/apps";
import { isLocaleShown } from "@/features/vocabulary/lib/target-language";
import "../store.css";

function AppSection({ app }: { app: EcosystemApp }): React.ReactElement {
  const accent = { "--eco-from": app.accent[0], "--eco-to": app.accent[1] } as React.CSSProperties;
  return (
    <section className="store-app" style={accent} aria-labelledby={`store-${app.id}`}>
      <header className="store-app-head">
        <span className="store-app-glyph" aria-hidden="true">
          {app.glyph}
        </span>
        <div className="store-app-id">
          <h2 className="store-app-name" id={`store-${app.id}`}>
            {app.name}
          </h2>
          <p className="store-app-tagline">{app.tagline}</p>
        </div>
        {app.status === "live" ? (
          <a
            className="store-app-open"
            href={app.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Mở ${app.name}`}
          >
            Mở
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : (
          <span className="store-app-soon">Sắp có</span>
        )}
      </header>

      <p className="store-app-copy">{app.description}</p>

      {/* Horizontal strip, the way a store shows captures: it scrolls rather
          than shrinking three frames down to thumbnails on a phone. */}
      <ul className="store-shots" aria-label={`Ảnh màn hình ${app.name}`}>
        {app.shots.map((caption) => (
          <li className="store-shot" key={caption}>
            <div className="store-shot-frame" aria-hidden="true">
              <span className="store-shot-glyph">{app.glyph}</span>
            </div>
            <span className="store-shot-caption">{caption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Store listing for the whole app family.
 * @returns The store page.
 */
export function StorePage(): React.ReactElement {
  return (
    <main className="vocabulary-shell store-shell">
      <header className="store-head">
        <Link className="vocab-icon-button" to="/feed" aria-label="Về luồng từ vựng">
          <ArrowLeft size={19} />
        </Link>
        <div>
          <h1 className="store-title">Cửa hàng Chay Lá</h1>
          <p className="store-subtitle">Mọi app trong nhà Chay Lá, kèm ảnh màn hình và mô tả.</p>
        </div>
      </header>

      <div className="store-list">
        {ECOSYSTEM_APPS.filter((app) => isLocaleShown(app.locale)).map((app) => (
          <AppSection key={app.id} app={app} />
        ))}
      </div>

      <p className="store-foot">
        Bạn đang ở anh.chayLá — app từ vựng của nhà Chay Lá, nên nó không có trong danh sách.
      </p>
    </main>
  );
}
