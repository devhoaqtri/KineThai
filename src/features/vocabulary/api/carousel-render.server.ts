/**
 * Render a carousel on the admin's own machine, for the studio's Export button.
 *
 * The studio cannot capture a slide exactly from inside the page, but it can ask this
 * machine's Chrome to, which is what scripts/render-carousel.ts does. The route that calls
 * this answers 404 in a production build, and the build fails if this module reaches one.
 *
 * The response is one JSON object per line: progress as each slide lands, then the result,
 * so the studio can count slides while a word renders.
 *
 * Exports: carouselRenderResponse
 * Depends on: zod, scripts/render-carousel, the machine's `open` command (macOS)
 */
import { spawn } from "node:child_process";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { renderCarousel } from "../../../../scripts/render-carousel";
import { CAROUSEL_FORMATS } from "../lib/carousel-formats";
import { isShareCode, normalizeShareCode } from "../lib/share-code";
import { STYLE_IDS } from "../lib/schema";

const EXPORT_ROOT = resolve("exports/carousel");

const renderSchema = z.object({
  action: z.literal("render"),
  code: z.string().max(12),
  format: z.enum(CAROUSEL_FORMATS.map((format) => format.id) as [string, ...string[]]),
  theme: z.string().max(400).optional(),
  style: z.enum([...STYLE_IDS, "mix"] as [string, ...string[]]).optional(),
  dialect: z.enum(["default", "douyin"]).optional(),
  handle: z
    .string()
    .regex(/^@?[\w.]{1,30}$/)
    .optional(),
  url: z
    .string()
    .regex(/^[a-z]+\.chayla\.app$/)
    .optional(),
  allowProblems: z.boolean().optional(),
});

const openSchema = z.object({ action: z.literal("open"), folder: z.string().max(500) });

const requestSchema = z.discriminatedUnion("action", [renderSchema, openSchema]);

/** Show a folder in Finder, but only one this tool wrote. */
function openFolder(folder: string): boolean {
  const target = resolve(folder);
  if (!target.startsWith(EXPORT_ROOT + sep)) return false;
  spawn("open", [target], { stdio: "ignore", detached: true }).unref();
  return true;
}

/**
 * Handle one studio request.
 * @param request - a POST from the studio
 * @returns A stream of JSON lines for a render, or a small JSON reply
 */
export async function carouselRenderResponse(request: Request): Promise<Response> {
  // A page on another site can post to localhost; only the studio itself may start Chrome.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return Response.json({ error: "Only the studio can ask for this." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (parsed.data.action === "open") {
    return Response.json({ opened: openFolder(parsed.data.folder) });
  }
  const { code, action: _action, ...options } = parsed.data;
  const shareCode = normalizeShareCode(code);
  if (!isShareCode(shareCode)) return Response.json({ error: "Invalid code" }, { status: 400 });
  const base = new URL(request.url).origin;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        const result = await renderCarousel({
          ...options,
          code: shareCode,
          base,
          out: EXPORT_ROOT,
          onSlide: (slide, count) => send({ slide: slide + 1, count }),
        });
        openFolder(result.folder);
        send({
          done: true,
          folder: result.folder,
          slides: result.slides.length,
          warning: result.warning,
        });
      } catch (error) {
        send({ error: error instanceof Error ? error.message : String(error) });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
