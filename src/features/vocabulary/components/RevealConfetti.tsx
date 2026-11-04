/**
 * Draws one reveal confetti burst (lib/reveal-confetti) on a canvas laid over the card.
 *
 * Purely presentational, like EmojiBurst: it arms no page timer and takes no pointer
 * events. It owns only its animation frame loop, and `paused` stops the loop where it is,
 * so pieces hang mid-air under an overlay and carry on from the same spot. Remount it
 * (a new `key`) to throw again.
 *
 * Exports: RevealConfetti
 * Depends on: ../lib/reveal-confetti
 */

import { useEffect, useRef } from "react";
import {
  particleAlpha,
  spawnConfetti,
  stepConfetti,
  type ConfettiParticle,
  type ConfettiScene,
  type ConfettiVariant,
} from "../lib/reveal-confetti";

/** Longest step one frame may take, so a stalled tab does not teleport the field. */
const MAX_STEP = 1 / 30;

export function RevealConfetti({
  variant,
  width,
  height,
  originX,
  originY,
  palette,
  seed,
  paused = false,
  reducedMotion = false,
  timeScale = 1,
}: {
  variant: ConfettiVariant;
  width: number;
  height: number;
  /** The revealed word's centre, card-local px. */
  originX: number;
  originY: number;
  palette: readonly string[];
  seed: string;
  paused?: boolean;
  reducedMotion?: boolean;
  /** 1 is real time; below 1 is slow motion. */
  timeScale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<ConfettiParticle[] | null>(null);
  const scene = useRef<ConfettiScene | null>(null);
  const scale = useRef(timeScale);
  scale.current = timeScale;

  // A new burst only when what it is thrown from changes; a resize mid-flight keeps it.
  useEffect(() => {
    if (reducedMotion || width <= 0 || height <= 0) return;
    const next: ConfettiScene = { width, height, originX, originY, palette, seed };
    scene.current = next;
    field.current = spawnConfetti(variant, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, seed, reducedMotion]);

  useEffect(() => {
    const node = canvas.current;
    if (!node || reducedMotion) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    node.width = Math.round(width * dpr);
    node.height = Math.round(height * dpr);
    const ctx = node.getContext("2d");
    if (!ctx) return;
    if (scene.current) scene.current = { ...scene.current, width, height };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, field.current ?? [], width, height);
    if (paused) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(MAX_STEP, (now - last) / 1000) * scale.current;
      last = now;
      const current = scene.current;
      if (!current || !field.current) return;
      field.current = stepConfetti(field.current, dt, current);
      draw(ctx, field.current, width, height);
      if (field.current.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [width, height, paused, reducedMotion, variant, seed]);

  if (reducedMotion) return null;
  return (
    <canvas
      ref={canvas}
      className="vocab-reveal-confetti"
      aria-hidden="true"
      style={{ width, height }}
    />
  );
}

function draw(ctx: CanvasRenderingContext2D, field: ConfettiParticle[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  for (const p of field) {
    const alpha = particleAlpha(p);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    if (p.trail && p.trail.length >= 4) drawTrail(ctx, p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    drawPiece(ctx, p);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawTrail(ctx: CanvasRenderingContext2D, p: ConfettiParticle) {
  const t = p.trail!;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.shape === "ribbon") {
    // A streamer is all trail: one curling band.
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size * 0.55;
    ctx.beginPath();
    ctx.moveTo(t[0]!, t[1]!);
    for (let i = 2; i < t.length; i += 2) ctx.lineTo(t[i]!, t[i + 1]!);
    ctx.stroke();
  } else {
    // A spark's trail thins and fades behind it.
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = p.color;
    const segments = t.length / 2 - 1;
    for (let i = 0; i < segments; i++) {
      const share = (i + 1) / segments;
      ctx.globalAlpha = particleAlpha(p) * share * 0.55;
      ctx.lineWidth = p.size * share * 0.8;
      ctx.beginPath();
      ctx.moveTo(t[i * 2]!, t[i * 2 + 1]!);
      ctx.lineTo(t[i * 2 + 2]!, t[i * 2 + 3]!);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPiece(ctx: CanvasRenderingContext2D, p: ConfettiParticle) {
  const s = p.size;
  const face = Math.cos(p.flip);
  switch (p.shape) {
    case "strip":
    case "square": {
      const [w, h] = p.shape === "strip" ? [s * 0.5, s * 1.15] : [s * 0.8, s * 0.8];
      // Paper turning over: the face narrows to an edge, and its back is a shade darker.
      ctx.scale(1, Math.max(0.08, Math.abs(face)));
      ctx.fillStyle = p.color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (face < 0) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      if (p.shimmer) {
        const glint = Math.pow(Math.max(0, Math.sin(p.flip)), 6);
        if (glint > 0.02) {
          ctx.fillStyle = `rgba(255,255,255,${(glint * 0.85).toFixed(3)})`;
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
      }
      return;
    }
    case "circle": {
      ctx.scale(Math.max(0.12, Math.abs(face)), 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "star": {
      const twinkle = 0.55 + 0.45 * Math.abs(Math.sin(p.flip * 0.5));
      ctx.scale(twinkle, twinkle);
      if (p.glow) {
        ctx.globalCompositeOperation = "lighter";
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.4);
        halo.addColorStop(0, withAlpha(p.color, 0.55));
        halo.addColorStop(1, withAlpha(p.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      // A four-point sparkle: thin arms, pinched waist.
      const r = s * 0.75;
      const k = r * 0.22;
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(k, -k, r, 0);
      ctx.quadraticCurveTo(k, k, 0, r);
      ctx.quadraticCurveTo(-k, k, -r, 0);
      ctx.quadraticCurveTo(-k, -k, 0, -r);
      ctx.fill();
      return;
    }
    case "spark":
    case "shell": {
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2);
      halo.addColorStop(0, withAlpha(p.color, 0.7));
      halo.addColorStop(1, withAlpha(p.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, s * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "ribbon":
      return;
  }
}

/** `#rrggbb` with an alpha, as rgba(); any other colour string is returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1]!, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
