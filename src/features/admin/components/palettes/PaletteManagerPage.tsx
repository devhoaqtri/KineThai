/**
 * Admin palette manager — CRUD for the harmonized palette collection.
 *
 * Each row previews the palette the way the feed actually paints it (body text,
 * an emphasized word, a progress bar and a pill on an accent fill) next to the
 * live audit, so an operator can see a conflict instead of guessing at hex values.
 *
 * Exports: PaletteManagerPage
 * Depends on: @tanstack/react-query, palette.functions, queries, canvas/palettes
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  auditPalette,
  describePaletteCheck,
  ensureReadablePalette,
  PALETTE_FONTS,
  generatePalette,
  PALETTE_SCHEMES,
  paletteBackdropColors,
  type Palette,
  type PaletteAudit,
  type PaletteScheme,
  type PaletteTone,
} from "@/features/canvas";
import { adminPalettesQueryOptions } from "../../api/queries";
import {
  deletePalette,
  savePalette,
  type PaletteDeleteResult,
  type PaletteSaveResult,
} from "../../api/palette.functions";

const TONES: readonly PaletteTone[] = ["dark", "light"];
const DEFAULT_ANGLE = "135deg";

function composeBackground(a: string, b: string): string {
  return `linear-gradient(${DEFAULT_ANGLE},${a},${b})`;
}

function slugOf(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "palette"
  );
}

/** Render a palette exactly the way the feed consumes its roles. */
function PalettePreview({ palette }: { palette: Palette }) {
  return (
    <div
      className="relative h-32 w-full overflow-hidden rounded-md p-3"
      style={{ background: palette.background, fontFamily: `${palette.font}, sans-serif` }}
    >
      <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: palette.ink }}>
        Ý nghĩa
      </p>
      <p className="mt-1 text-lg leading-tight font-extrabold" style={{ color: palette.ink }}>
        Dễ <span style={{ color: palette.accentA, textDecoration: "underline" }}>tin cậy</span>
      </p>
      <div className="mt-2 flex gap-1">
        <span className="h-1 flex-1 rounded" style={{ background: palette.accentA }} />
        <span className="h-1 flex-1 rounded" style={{ background: palette.accentB }} />
        <span className="h-1 flex-1 rounded" style={{ background: palette.ink, opacity: 0.26 }} />
      </div>
      <span
        className="mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-bold"
        style={{ background: palette.accentA, color: palette.onAccent }}
      >
        Ê, từ này biết nè
      </span>
      <span
        className="ml-1 inline-block rounded-full px-2 py-1 text-[11px] font-bold"
        style={{ background: palette.accentB, color: palette.onAccent }}
      >
        B
      </span>
    </div>
  );
}

/** One audit row: what was measured against what floor. */
function AuditList({ audit }: { audit: PaletteAudit }) {
  const failing = audit.checks.filter((check) => !check.pass);
  if (!failing.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Every pair clears its floor. Tightest contrast{" "}
        <span className="font-semibold">{audit.worstContrast.toFixed(2)}:1</span>.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1 text-xs text-red-600">
      {failing.map((check) => (
        <li key={check.id}>{describePaletteCheck(check)}</li>
      ))}
    </ul>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  // `<input type="color">` only accepts #rrggbb, so fall back to black for a value
  // it cannot represent while the text field still shows the real string.
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={swatch}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-background p-0.5"
        aria-label={`${label} color picker`}
      />
      <span className="flex flex-1 flex-col gap-1">
        <span className="font-medium text-muted-foreground">{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          aria-label={`${label} hex value`}
        />
      </span>
    </label>
  );
}

/** Blank-but-valid starting point for a brand new palette. */
function draftPalette(): Palette {
  return generatePalette({
    id: "new-palette",
    label: "New palette",
    mood: "",
    hue: 265,
    scheme: "analogous",
    tone: "dark",
  });
}

export function PaletteManagerPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(adminPalettesQueryOptions());
  const [draft, setDraft] = useState<Palette | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const palettes = useMemo(() => data ?? [], [data]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "palettes"] });

  const saveMut = useMutation({
    mutationFn: (palette: Palette) => savePalette({ data: { palette } }),
    onSuccess: (result: PaletteSaveResult) => {
      if (!result.ok) {
        setBanner({ tone: "error", text: result.errors.join(" · ") });
        return;
      }
      setBanner({ tone: "ok", text: `Saved “${result.palette.label}”.` });
      setDraft(null);
      setEditingId(null);
      invalidate();
    },
    onError: (error: Error) => setBanner({ tone: "error", text: error.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePalette({ data: { id } }),
    onSuccess: (result: PaletteDeleteResult, id: string) => {
      if (!result.ok) {
        setBanner({ tone: "error", text: result.errors.join(" · ") });
        return;
      }
      setBanner({ tone: "ok", text: `Deleted ${id}.` });
      if (editingId === id) {
        setDraft(null);
        setEditingId(null);
      }
      invalidate();
    },
    onError: (error: Error) => setBanner({ tone: "error", text: error.message }),
  });

  // A stale banner reads as a fresh failure, so clear it when a new edit starts.
  useEffect(() => setBanner(null), [editingId]);

  if (isLoading) return <p className="text-muted-foreground">Loading palettes…</p>;

  const draftAudit = draft ? auditPalette(draft) : null;
  const patch = (next: Partial<Palette>) =>
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  const patchStops = (index: 0 | 1, hex: string) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const stops = paletteBackdropColors(prev.background);
      stops[index] = hex;
      return { ...prev, background: composeBackground(stops[0], stops[1]) };
    });

  const startAdd = () => {
    setEditingId(null);
    setDraft(draftPalette());
  };
  const startEdit = (palette: Palette) => {
    setEditingId(palette.id);
    setDraft({ ...palette });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Palettes</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{palettes.length} palettes</span>
          <button
            type="button"
            onClick={startAdd}
            className="rounded bg-foreground px-3 py-1.5 text-xs text-background"
          >
            New palette
          </button>
        </div>
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        A palette binds four interdependent roles — a two-color backdrop, body text, and two
        highlights — plus the label color used on a highlight fill. Saves are refused unless every
        pair clears its WCAG floor and the backdrop keeps two distinct colors, and this file is the
        one the feed renders from, so a save takes effect on the next reload of{" "}
        <span className="font-mono">/feed</span>.
      </p>

      {banner && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-xs ${
            banner.tone === "ok"
              ? "border-border bg-muted text-foreground"
              : "border-red-600 bg-red-600/10 text-red-600"
          }`}
        >
          {banner.text}
        </div>
      )}

      {draft && draftAudit && (
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {editingId ? `Edit ${editingId}` : "New palette"}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
                className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => patch(ensureReadablePalette(draft))}
                disabled={draftAudit.pass}
                className="rounded border border-border px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Repair contrast
              </button>
              <button
                type="button"
                onClick={() => saveMut.mutate(draft)}
                disabled={saveMut.isPending}
                className="rounded bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-50"
              >
                {saveMut.isPending ? "Saving…" : "Save palette"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div className="flex flex-col gap-3">
              <PalettePreview palette={draft} />
              <div
                className={`rounded-md border px-3 py-2 ${
                  draftAudit.pass ? "border-border" : "border-red-600"
                }`}
              >
                <p className="mb-1 text-xs font-semibold">
                  {draftAudit.pass ? "Passes every check" : "Fails these checks"}
                </p>
                <AuditList audit={draftAudit} />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Id</span>
                  <input
                    value={draft.id}
                    disabled={!!editingId}
                    onChange={(event) => patch({ id: slugOf(event.target.value) })}
                    className="rounded border border-border bg-background px-2 py-1 font-mono text-xs disabled:opacity-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Label</span>
                  <input
                    value={draft.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      // A new palette derives its id from the label until it is saved.
                      patch(editingId ? { label } : { label, id: slugOf(label) });
                    }}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                  <span className="font-medium text-muted-foreground">Mood</span>
                  <input
                    value={draft.mood}
                    onChange={(event) => patch({ mood: event.target.value })}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Font</span>
                  <select
                    value={draft.font}
                    onChange={(event) => patch({ font: event.target.value })}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    {PALETTE_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Tone</span>
                  <select
                    value={draft.tone}
                    onChange={(event) => patch({ tone: event.target.value as PaletteTone })}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    {TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {tone}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Scheme</span>
                  <select
                    value={draft.scheme}
                    onChange={(event) => patch({ scheme: event.target.value as PaletteScheme })}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    {PALETTE_SCHEMES.map((scheme) => (
                      <option key={scheme} value={scheme}>
                        {scheme}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">Base hue — {draft.hue}°</span>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={draft.hue}
                    onChange={(event) => patch({ hue: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() =>
                  // Regenerate from hue/scheme/tone, keeping the identity fields.
                  patch(
                    generatePalette({
                      id: draft.id,
                      label: draft.label,
                      mood: draft.mood,
                      hue: draft.hue,
                      scheme: draft.scheme,
                      tone: draft.tone,
                      font: draft.font,
                    }),
                  )
                }
                className="self-start rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Generate harmonious colors
              </button>

              <div className="grid gap-3 sm:grid-cols-2">
                {(["ink", "accentA", "accentB", "onAccent"] as const).map((role) => (
                  <ColorField
                    key={role}
                    label={
                      {
                        ink: "Text (ink)",
                        accentA: "Highlight A",
                        accentB: "Highlight B",
                        onAccent: "Label on highlight",
                      }[role]
                    }
                    value={draft[role]}
                    onChange={(next) => patch({ [role]: next } as Partial<Palette>)}
                  />
                ))}
              </div>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">Background CSS</span>
                <input
                  value={draft.background}
                  onChange={(event) => patch({ background: event.target.value })}
                  className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                />
                <span className="text-muted-foreground">
                  The two pickers below rewrite this as a {DEFAULT_ANGLE} gradient. They have to
                  stay two different colors — a backdrop that is one color at two lightnesses fails
                  the audit.
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {([0, 1] as const).map((index) => (
                  <ColorField
                    key={index}
                    label={index === 0 ? "Backdrop — main color" : "Backdrop — second color"}
                    value={paletteBackdropColors(draft.background)[index]}
                    onChange={(next) => patchStops(index, next)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {palettes.map((palette) => {
          const audit = auditPalette(palette);
          return (
            <article
              key={palette.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-3"
            >
              <PalettePreview palette={palette} />
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{palette.label}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      audit.pass ? "bg-muted text-muted-foreground" : "bg-red-600/15 text-red-600"
                    }`}
                  >
                    {audit.pass ? `${audit.worstContrast.toFixed(2)}:1 min` : "unreadable"}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{palette.id}</p>
                <p className="text-xs text-muted-foreground">
                  {palette.mood || `${palette.scheme} · ${palette.tone} · ${palette.hue}°`}
                </p>
                <div className="flex gap-1 pt-1">
                  {/* Both backdrop colors get their own chip: the gradient alone reads
                      as one swatch and hides which second color the palette carries. */}
                  {[
                    ...paletteBackdropColors(palette.background),
                    palette.ink,
                    palette.accentA,
                    palette.accentB,
                    palette.onAccent,
                  ].map((color, index) => (
                    <span
                      key={`${index}-${color}`}
                      title={color}
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                {!audit.pass && <AuditList audit={audit} />}
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(palette)}
                  className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(palette.id)}
                  disabled={deleteMut.isPending || palettes.length <= 1}
                  title={
                    palettes.length <= 1 ? "The last palette cannot be deleted" : "Delete palette"
                  }
                  className="rounded border border-red-600/40 px-3 py-1.5 text-xs text-red-600 hover:bg-red-600/10 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {palettes.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No palettes yet. Create one to give the feed something to render.
        </p>
      )}
    </div>
  );
}
