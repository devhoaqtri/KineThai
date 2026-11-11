/**
 * Library panel to import a personal pack from a local JSON file or a direct URL.
 * Validated against the default deck format and kept only in this browser. A pack lands
 * in the list right under the import row (./ImportedPackList) rather than playing at once,
 * so the reader can look through it first; playing it makes the feed play just that pack
 * with random themes, styles and effects. A second tab offers the AI prompt kit to preview
 * full-screen or download.
 *
 * Exports: ImportPackPanel
 */
import { useRef, useState, type ClipboardEvent } from "react";
import { Download, Eye, FileText, FileUp, Link2, Sparkles } from "lucide-react";
import {
  addCustomPack,
  loadCustomPackFromUrl,
  packSizeError,
  parseCustomPack,
  type CustomPack,
} from "../lib/custom-pack";
import { useCustomPacks } from "../hooks/useCustomPacks";
import { PACK_KIT_MD, downloadPackKit } from "../lib/sample-pack";
import { FullscreenSheet } from "./FullscreenSheet";
import { ImportedPackList } from "./ImportedPackList";
import { PackKitDoc } from "./PackKitDoc";

/** Packs shipped in public/sample-packs, for trying the import without a file of one's own. */
const SAMPLE_PACKS = [
  { file: "du-lich-a2.json", label: "Du lịch · A1–A2" },
  { file: "nha-bep-b1.json", label: "Nhà bếp · B1" },
  { file: "cong-so-nhieu-cap.json", label: "Công sở · A1–C1" },
] as const;

const looksLikeUrl = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

export function ImportPackPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"import" | "generate">("import");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [kitOpen, setKitOpen] = useState(false);
  const library = useCustomPacks();

  const run = async (task: () => Promise<CustomPack>) => {
    setBusy(true);
    setError(null);
    try {
      const pack = addCustomPack(await task());
      setFresh(pack.id);
      setUrl("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message.split("\n").slice(0, 4).join("\n") : "Không nhập được gói.",
      );
    } finally {
      setBusy(false);
    }
  };
  const fromUrl = (link: string) => void run(() => loadCustomPackFromUrl(link));
  // A pasted link is the whole intent: load it straight away instead of waiting for a tap.
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    if (!looksLikeUrl(pasted) || busy) return;
    event.preventDefault();
    setUrl(pasted.trim());
    fromUrl(pasted);
  };

  return (
    <section className="vocab-import" aria-labelledby="vocab-import-title">
      <h2 id="vocab-import-title" className="vocab-library-group-title">
        Nhập gói của bạn
      </h2>
      <p className="vocab-library-group-note">
        Muốn học từ của riêng bạn? Tải gói lên hoặc dán liên kết, dòng từ sẽ chỉ phát những từ trong
        gói đó. Gói chỉ lưu trên máy này, không gửi đi đâu.
      </p>
      <div className="vocab-import-tabs" role="tablist" aria-label="Cách nhập gói">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "import"}
          className={`vocab-import-tab${tab === "import" ? " on" : ""}`}
          onClick={() => setTab("import")}
        >
          Nhập tệp
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "generate"}
          className={`vocab-import-tab${tab === "generate" ? " on" : ""}`}
          onClick={() => setTab("generate")}
        >
          Tạo gói bằng AI
        </button>
      </div>
      {tab === "import" ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              // A file over the limit is refused before it is read into memory.
              void run(async () => {
                const tooBig = packSizeError(picked.size);
                if (tooBig) throw new Error(tooBig);
                return parseCustomPack(await picked.text(), picked.name);
              });
            }}
          />
          <form
            className="vocab-import-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) fromUrl(url);
              else fileRef.current?.click();
            }}
          >
            <input
              className="vocab-import-url"
              type="url"
              inputMode="url"
              placeholder="Dán liên kết JSON, hoặc tải tệp lên"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={onPaste}
              aria-label="Liên kết trực tiếp tới tệp JSON"
            />
            <button type="submit" className="vocab-import-btn" disabled={busy}>
              {busy ? (
                "Đang tải…"
              ) : url.trim() ? (
                <>
                  <Link2 size={15} aria-hidden="true" /> Liên kết
                </>
              ) : (
                <>
                  <FileUp size={15} aria-hidden="true" /> Tải lên
                </>
              )}
            </button>
          </form>
          <div className="vocab-import-samples">
            <span>
              <Sparkles size={13} aria-hidden="true" /> Thử gói mẫu:
            </span>
            {SAMPLE_PACKS.map((sample) => (
              <button
                key={sample.file}
                type="button"
                className="vocab-import-sample"
                disabled={busy}
                onClick={() =>
                  fromUrl(new URL(`/sample-packs/${sample.file}`, window.location.origin).href)
                }
              >
                {sample.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="vocab-import-generate">
          <p className="vocab-library-group-note">
            Gửi tệp này cùng danh sách từ của bạn cho AI (ChatGPT, Gemini…) để nó tạo gói từ vựng
            theo hướng dẫn trong tệp.
          </p>
          <div className="vocab-import-row vocab-import-actions">
            <button
              type="button"
              className="vocab-import-btn ghost"
              aria-haspopup="dialog"
              onClick={() => setKitOpen(true)}
            >
              <Eye size={15} aria-hidden="true" /> Xem trước
            </button>
            <button type="button" className="vocab-import-btn" onClick={downloadPackKit}>
              <Download size={15} aria-hidden="true" /> Tải xuống
            </button>
          </div>
          <FullscreenSheet
            open={kitOpen}
            onOpenChange={setKitOpen}
            icon={<FileText size={20} aria-hidden="true" />}
            title="Hướng dẫn tạo gói bằng AI"
            subtitle="tao-goi-tu-vung.md"
            footer={
              <button type="button" className="vocab-import-btn" onClick={downloadPackKit}>
                <Download size={15} aria-hidden="true" /> Tải tệp hướng dẫn
              </button>
            }
          >
            <div className="vocab-preview-raw">
              <PackKitDoc markdown={PACK_KIT_MD} />
            </div>
          </FullscreenSheet>
        </div>
      )}
      {error && (
        <p className="vocab-import-error" role="alert">
          {error}
        </p>
      )}
      <ImportedPackList packs={library.packs} active={library.active} fresh={fresh} />
    </section>
  );
}
