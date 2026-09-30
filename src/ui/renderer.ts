import type { Vec2 } from '../engine/types';
import { drawBridge, type BridgeScene } from './scenes/bridge';
import { drawGears, type GearsScene } from './scenes/gears';
import { drawProjectile, type ProjectileScene } from './scenes/projectile';

export type { BridgeScene, GearsScene, ProjectileScene };
export type Scene = (ProjectileScene | BridgeScene | GearsScene) & { dim: number; shake: Vec2 };

export interface ViewRect {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Palette shared with styles.css. Cyan and coral always mean the two halves of a concept. */
export const COLORS = {
  ink: '#e9e6dd',
  muted: 'rgba(233,230,221,0.5)',
  faint: 'rgba(233,230,221,0.14)',
  lumen: '#f5b84a',
  lumenCore: '#fff3d6',
  cyan: '#6fcfe0',
  coral: '#ff8a6e',
  ok: '#9fdcae',
  steel: '#aeb8c2',
  night: '#0a121b',
};
export const MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Maps world metres to canvas pixels. The world's view rectangle is fitted to
 * the canvas and anchored to the bottom edge; y points up in the world.
 */
export class Painter {
  readonly ctx: CanvasRenderingContext2D;
  cssW = 1;
  cssH = 1;
  dpr = 1;
  scale = 20;
  private ox = 0;
  private baseY = 0;
  private view: ViewRect = { minX: 0, minY: 0, width: 1, height: 1 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the lab (Canvas 2D unavailable).');
    this.ctx = ctx;
  }

  resize(width: number, height: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = Math.max(1, width);
    this.cssH = Math.max(1, height);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.fit(this.view);
  }

  fit(view: ViewRect) {
    this.view = view;
    const padX = this.cssW < 600 ? 12 : 36;
    const padTop = 20;
    const sx = (this.cssW - 2 * padX) / view.width;
    const sy = (this.cssH - padTop) / view.height;
    this.scale = Math.max(1, Math.min(sx, sy));
    this.ox = (this.cssW - view.width * this.scale) / 2 - view.minX * this.scale;
    this.baseY = this.cssH;
  }

  sx(x: number) {
    return this.ox + x * this.scale;
  }
  sy(y: number) {
    return this.baseY - (y - this.view.minY) * this.scale;
  }
  toWorld(px: number, py: number): Vec2 {
    return { x: (px - this.ox) / this.scale, y: (this.baseY - py) / this.scale + this.view.minY };
  }

  text(t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'middle', font = MONO) {
    const c = this.ctx;
    c.font = font;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = baseline;
    c.fillText(t, x, y);
  }

  /** Text on a dark rounded pill, for labels that sit over busy drawings. */
  pill(t: string, x: number, y: number, color = COLORS.ink) {
    const c = this.ctx;
    c.font = MONO;
    const w = c.measureText(t).width + 10;
    c.fillStyle = 'rgba(10,18,27,0.88)';
    roundRect(c, x - w / 2, y - 9, w, 18, 4);
    c.fill();
    this.text(t, x, y, color, 'center');
  }

  backdrop(theme: 'lab' | 'moon', stars: { x: number; y: number; r: number; a: number }[]) {
    const c = this.ctx;
    const W = this.cssW;
    const H = this.cssH;
    const moon = theme === 'moon';
    const g = c.createRadialGradient(W * 0.45, H * 0.05, 0, W * 0.45, H * 0.05, Math.max(W, H));
    g.addColorStop(0, moon ? '#121722' : '#16273a');
    g.addColorStop(1, moon ? '#040609' : '#0a121b');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (!moon) return;
    for (const st of stars) {
      c.fillStyle = `rgba(233,230,221,${st.a})`;
      c.beginPath();
      c.arc(st.x * W, st.y * H * 0.8, st.r, 0, Math.PI * 2);
      c.fill();
    }
    const r = Math.min(W, H) * 0.035;
    const ex = W * 0.86;
    const ey = H * 0.16;
    const eg = c.createRadialGradient(ex - r * 0.3, ey - r * 0.3, r * 0.1, ex, ey, r);
    eg.addColorStop(0, '#9cc9ec');
    eg.addColorStop(1, '#23466b');
    c.fillStyle = eg;
    c.beginPath();
    c.arc(ex, ey, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(4,6,9,0.65)';
    c.beginPath();
    c.arc(ex + r * 0.45, ey, r, -Math.PI / 2, Math.PI / 2);
    c.arc(ex, ey, r, Math.PI / 2, -Math.PI / 2, true);
    c.fill();
  }

  /** Faint metre grid across a world rectangle, with bolder lines every `major`. */
  grid(minX: number, maxX: number, minY: number, maxY: number, step = 1, major = 5) {
    const c = this.ctx;
    c.lineWidth = 1;
    for (let x = Math.ceil(minX / step) * step; x <= maxX + 1e-9; x += step) {
      c.strokeStyle = Math.abs(x % major) < 1e-9 ? 'rgba(233,230,221,0.08)' : 'rgba(233,230,221,0.03)';
      const px = Math.round(this.sx(x)) + 0.5;
      c.beginPath();
      c.moveTo(px, this.sy(minY));
      c.lineTo(px, this.sy(maxY));
      c.stroke();
    }
    for (let y = Math.ceil(minY / step) * step; y <= maxY + 1e-9; y += step) {
      c.strokeStyle = Math.abs(y % major) < 1e-9 ? 'rgba(233,230,221,0.08)' : 'rgba(233,230,221,0.03)';
      const py = Math.round(this.sy(y)) + 0.5;
      c.beginPath();
      c.moveTo(this.sx(minX), py);
      c.lineTo(this.sx(maxX), py);
      c.stroke();
    }
  }
}

export function arrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, weight = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 2) return;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.min(8, len * 0.4) * weight;
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.5 * weight;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2 - Math.cos(a) * head * 0.6, y2 - Math.sin(a) * head * 0.6);
  c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head);
  c.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head);
  c.closePath();
  c.fill();
  c.restore();
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Seeded so the starfield is identical on every load. */
export function makeStars(n: number) {
  let seed = 1337;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: rnd() * 1.1 + 0.3, a: rnd() * 0.5 + 0.15 }));
}

export class LabRenderer {
  readonly p: Painter;
  private readonly stars = makeStars(160);

  constructor(canvas: HTMLCanvasElement) {
    this.p = new Painter(canvas);
  }

  resize(w: number, h: number) {
    this.p.resize(w, h);
  }

  toWorld(px: number, py: number, view: ViewRect): Vec2 {
    this.p.fit(view);
    return this.p.toWorld(px, py);
  }

  draw(s: Scene) {
    const p = this.p;
    const c = p.ctx;
    p.fit(s.world.view);
    c.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    p.backdrop(s.world.theme, this.stars);
    c.save();
    c.translate(s.shake.x, s.shake.y);
    if (s.kind === 'projectile') drawProjectile(p, s);
    else if (s.kind === 'bridge') drawBridge(p, s);
    else drawGears(p, s);
    c.restore();
    if (s.dim > 0) {
      c.fillStyle = `rgba(7,12,18,${s.dim})`;
      c.fillRect(0, 0, p.cssW, p.cssH);
    }
  }
}
