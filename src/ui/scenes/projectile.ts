import { DT, type BallState, type Outcome, type SimResult } from '../../engine/projectile';
import type { AABB, LaunchConfig, ProjectileWorld, Vec2 } from '../../engine/types';
import { arrow, COLORS, MONO, roundRect, type Painter } from '../renderer';

export interface ProjectileScene {
  kind: 'projectile';
  world: ProjectileWorld;
  config: LaunchConfig;
  showAimGuide: boolean;
  prediction: Vec2 | null;
  ghosts: { result: SimResult; label: string; latest: boolean }[];
  active: { result: SimResult; index: number } | null;
  layers: { strobe: boolean; vectors: boolean };
  outcomeLink: boolean;
  targetLit: number;
  /** 0..1 progress of the impact ring, or null. */
  burst: number | null;
}

const STROBE_EVERY = 24; // frames → 0.2 s
const VECTOR_SCALE = 0.12; // metres of arrow per m/s

export function drawProjectile(p: Painter, s: ProjectileScene) {
  const w = s.world;
  p.grid(0, w.view.width, 0, w.view.minY + w.view.height, 1, 5);
  for (let y = 2; y <= w.view.minY + w.view.height; y += 2) p.text(`${y}`, p.sx(0) - 6, p.sy(y), COLORS.muted, 'right');
  ground(p, w);
  for (const o of w.obstacles) tower(p, o);
  target(p, w, s.targetLit);
  for (const g of s.ghosts) ghost(p, g.result, g.label, g.latest);
  if (s.active) activeTrail(p, s, s.active.result, s.active.index);
  launcher(p, w, s.config, s.showAimGuide);
  if (s.active) ball(p, w, s.active.result.frames[s.active.index]);
  if (s.prediction) predictionMarker(p, s.prediction);
  if (s.active && s.active.index === s.active.result.frames.length - 1) {
    outcomeMarker(p, s.active.result.outcome);
    if (s.outcomeLink && s.prediction) link(p, s.prediction, s.active.result.outcome);
  }
  if (s.burst !== null && s.active) burst(p, s.active.result.outcome, s.burst);
  if (s.active && (s.layers.vectors || s.layers.strobe)) legend(p, s.layers);
}

function ground(p: Painter, world: ProjectileWorld) {
  const c = p.ctx;
  const moon = world.theme === 'moon';
  const top = p.sy(0);
  const g = c.createLinearGradient(0, top, 0, p.cssH);
  g.addColorStop(0, moon ? '#2d2f33' : '#15212d');
  g.addColorStop(1, moon ? '#141517' : '#0a1119');
  c.fillStyle = g;
  c.fillRect(0, top, p.cssW, p.cssH - top);
  c.strokeStyle = moon ? 'rgba(233,230,221,0.35)' : 'rgba(245,184,74,0.45)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, Math.round(top) + 0.5);
  c.lineTo(p.cssW, Math.round(top) + 0.5);
  c.stroke();
  c.strokeStyle = COLORS.muted;
  for (let x = 0; x <= world.view.width; x++) {
    const px = Math.round(p.sx(x)) + 0.5;
    c.beginPath();
    c.moveTo(px, top);
    c.lineTo(px, top + (x % 5 === 0 ? 8 : 4));
    c.stroke();
    if (x % 5 === 0) p.text(x === world.view.width ? `${x} m` : `${x}`, px, top + 12, COLORS.muted, 'center', 'top');
  }
}

function tower(p: Painter, o: AABB) {
  const c = p.ctx;
  const x0 = p.sx(o.minX);
  const x1 = p.sx(o.maxX);
  const y0 = p.sy(o.maxY);
  const y1 = p.sy(o.minY);
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#2b3a4a');
  g.addColorStop(0.5, '#3a4b5c');
  g.addColorStop(1, '#1d2834');
  c.fillStyle = g;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  c.strokeStyle = 'rgba(233,230,221,0.06)';
  for (let d = -200; d < 400; d += 9) {
    c.beginPath();
    c.moveTo(x0 + d, y0);
    c.lineTo(x0 + d - (y1 - y0), y1);
    c.stroke();
  }
  c.restore();
  c.fillStyle = 'rgba(233,230,221,0.28)';
  c.fillRect(x0, y0, x1 - x0, 2);
}

function target(p: Painter, world: ProjectileWorld, lit: number) {
  const c = p.ctx;
  const t = world.target;
  const cx = p.sx(t.x);
  const cy = p.sy(t.y);
  const r = t.radius * p.scale;
  if (lit > 0) {
    const g = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.2);
    g.addColorStop(0, `rgba(245,184,74,${0.55 * lit})`);
    g.addColorStop(1, 'rgba(245,184,74,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r * 3.2, 0, Math.PI * 2);
    c.fill();
  }
  [1, 0.74, 0.48, 0.22].forEach((k, i) => {
    c.fillStyle = i % 2 === 0 ? (lit > 0 ? '#fff3d6' : '#d9d5ca') : lit > 0 ? COLORS.lumen : '#c4553f';
    c.beginPath();
    c.arc(cx, cy, r * k, 0, Math.PI * 2);
    c.fill();
  });
}

function launcher(p: Painter, world: ProjectileWorld, config: LaunchConfig, guide: boolean) {
  const c = p.ctx;
  const s = p.scale;
  const { x, y, barrelLength } = world.launcher;
  const px = p.sx(x);
  const py = p.sy(y);
  const gy = p.sy(0);
  const a = (config.angleDeg * Math.PI) / 180;

  if (guide) {
    c.save();
    c.strokeStyle = COLORS.faint;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + 2.6 * s, py);
    c.stroke();
    c.strokeStyle = 'rgba(245,184,74,0.35)';
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * 3.4 * s, py - Math.sin(a) * 3.4 * s);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = COLORS.lumen;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(px, py, 1.9 * s, -a, 0);
    c.stroke();
    p.text(`${config.angleDeg}°`, px + Math.cos(a / 2) * 2.15 * s, py - Math.sin(a / 2) * 2.15 * s, COLORS.lumen);
    p.text(`${config.speed.toFixed(1)} m/s`, px + Math.cos(a) * 3.6 * s + 4, py - Math.sin(a) * 3.6 * s, COLORS.ink);
    c.restore();
  }

  const pg = c.createLinearGradient(px - 0.6 * s, 0, px + 0.6 * s, 0);
  pg.addColorStop(0, '#223040');
  pg.addColorStop(0.5, '#34465a');
  pg.addColorStop(1, '#1a2530');
  c.fillStyle = pg;
  c.beginPath();
  c.moveTo(px - 0.6 * s, gy);
  c.lineTo(px + 0.6 * s, gy);
  c.lineTo(px + 0.2 * s, py);
  c.lineTo(px - 0.2 * s, py);
  c.closePath();
  c.fill();

  c.save();
  c.translate(px, py);
  c.rotate(-a);
  const bg = c.createLinearGradient(0, -0.17 * s, 0, 0.17 * s);
  bg.addColorStop(0, '#f1ede3');
  bg.addColorStop(0.55, '#a9a59b');
  bg.addColorStop(1, '#6f6c66');
  c.fillStyle = bg;
  roundRect(c, -0.3 * s, -0.16 * s, (barrelLength + 0.3) * s, 0.32 * s, 0.08 * s);
  c.fill();
  c.fillStyle = COLORS.lumen;
  c.fillRect(barrelLength * s - 0.08 * s, -0.17 * s, 0.08 * s, 0.34 * s);
  c.restore();

  c.fillStyle = '#16212c';
  c.strokeStyle = COLORS.lumen;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(px, py, 0.24 * s, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

function path(p: Painter, frames: BallState[], upto: number, every = 1) {
  const c = p.ctx;
  c.beginPath();
  c.moveTo(p.sx(frames[0].x), p.sy(frames[0].y));
  for (let i = every; i < upto; i += every) c.lineTo(p.sx(frames[i].x), p.sy(frames[i].y));
  c.lineTo(p.sx(frames[upto].x), p.sy(frames[upto].y));
}

function ghost(p: Painter, result: SimResult, label: string, latest: boolean) {
  const c = p.ctx;
  c.save();
  c.strokeStyle = latest ? 'rgba(233,230,221,0.38)' : 'rgba(233,230,221,0.15)';
  c.lineWidth = 1.25;
  c.setLineDash([2, 5]);
  path(p, result.frames, result.frames.length - 1, 2);
  c.stroke();
  c.setLineDash([]);
  const o = result.outcome;
  const ox = Math.min(Math.max(p.sx(o.x), 8), p.cssW - 8);
  const oy = Math.min(Math.max(p.sy(o.y), 8), p.cssH - 8);
  p.text(label, ox, oy - 8, latest ? COLORS.ink : COLORS.muted, 'center', 'bottom');
  c.fillStyle = latest ? COLORS.ink : COLORS.muted;
  c.beginPath();
  c.arc(ox, oy, 2.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function activeTrail(p: Painter, s: ProjectileScene, result: SimResult, index: number) {
  const c = p.ctx;
  const frames = result.frames;
  if (index > 0) {
    c.save();
    c.strokeStyle = COLORS.lumen;
    c.lineWidth = 2.25;
    c.shadowColor = 'rgba(245,184,74,0.7)';
    c.shadowBlur = 10;
    path(p, frames, index);
    c.stroke();
    c.restore();
  }
  if (!s.layers.strobe && !s.layers.vectors) return;
  const top = p.sy(0);
  const strobe: number[] = [];
  for (let i = 0; i <= index; i += STROBE_EVERY) strobe.push(i);

  if (s.layers.strobe) {
    c.save();
    for (const i of strobe) {
      const f = frames[i];
      const px = p.sx(f.x);
      c.strokeStyle = 'rgba(111,207,224,0.22)';
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(px, p.sy(f.y));
      c.lineTo(px, top);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = COLORS.cyan;
      c.beginPath();
      c.moveTo(px, top - 5);
      c.lineTo(px, top + 5);
      c.stroke();
      c.fillStyle = COLORS.night;
      c.strokeStyle = COLORS.ink;
      c.beginPath();
      c.arc(px, p.sy(f.y), 3.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    if (strobe.length >= 2) {
      const f0 = frames[0];
      const step = f0.vx * STROBE_EVERY * DT;
      p.text(`every ${(STROBE_EVERY * DT).toFixed(1)} s the ball moves ${step.toFixed(2)} m sideways`, p.sx(f0.x), top + 28, COLORS.cyan, 'left', 'top');
    }
    c.restore();
  }
  if (s.layers.vectors) {
    for (const i of strobe) vectors(p, frames[i], 1);
    vectors(p, frames[index], 1.6);
  }
}

function vectors(p: Painter, f: BallState, weight: number) {
  const px = p.sx(f.x);
  const py = p.sy(f.y);
  const k = VECTOR_SCALE * p.scale;
  arrow(p.ctx, px, py, px + f.vx * k, py, COLORS.cyan, weight);
  arrow(p.ctx, px, py, px, py - f.vy * k, COLORS.coral, weight);
}

function ball(p: Painter, world: ProjectileWorld, f: BallState) {
  const c = p.ctx;
  const px = p.sx(f.x);
  const py = p.sy(f.y);
  const r = Math.max(world.ball.radius * p.scale, 4.5);
  const g = c.createRadialGradient(px, py, 0, px, py, r * 4.5);
  g.addColorStop(0, 'rgba(245,184,74,0.6)');
  g.addColorStop(1, 'rgba(245,184,74,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(px, py, r * 4.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = COLORS.lumenCore;
  c.beginPath();
  c.arc(px, py, r, 0, Math.PI * 2);
  c.fill();
}

function predictionMarker(p: Painter, pt: Vec2) {
  const c = p.ctx;
  const px = p.sx(pt.x);
  const py = p.sy(pt.y);
  c.save();
  c.strokeStyle = COLORS.ink;
  c.lineWidth = 1.5;
  c.setLineDash([3, 3]);
  c.beginPath();
  c.arc(px, py, 11, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.beginPath();
    c.moveTo(px + dx * 5, py + dy * 5);
    c.lineTo(px + dx * 17, py + dy * 17);
    c.stroke();
  }
  p.text('your prediction', px, py - 20, COLORS.ink, 'center', 'bottom');
  c.restore();
}

function outcomeMarker(p: Painter, o: Outcome) {
  const c = p.ctx;
  c.strokeStyle = o.kind === 'target' ? COLORS.ok : COLORS.lumen;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(p.sx(o.x), p.sy(o.y), 7, 0, Math.PI * 2);
  c.stroke();
}

function link(p: Painter, pt: Vec2, o: Outcome) {
  const c = p.ctx;
  const x1 = p.sx(pt.x);
  const y1 = p.sy(pt.y);
  const x2 = p.sx(o.x);
  const y2 = p.sy(o.y);
  const d = Math.hypot(pt.x - o.x, pt.y - o.y);
  if (d < 0.3) return;
  c.save();
  c.strokeStyle = COLORS.muted;
  c.setLineDash([4, 4]);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.setLineDash([]);
  c.restore();
  p.pill(`${d.toFixed(2)} m apart`, (x1 + x2) / 2, (y1 + y2) / 2);
}

function burst(p: Painter, o: Outcome, t: number) {
  const c = p.ctx;
  const alpha = Math.max(0, 1 - t);
  c.strokeStyle = o.kind === 'target' ? `rgba(159,220,174,${alpha})` : `rgba(245,184,74,${alpha})`;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(p.sx(o.x), p.sy(o.y), 8 + 46 * t, 0, Math.PI * 2);
  c.stroke();
}

function legend(p: Painter, layers: { strobe: boolean; vectors: boolean }) {
  const c = p.ctx;
  let y = 22;
  if (layers.vectors) {
    arrow(c, 18, y, 46, y, COLORS.cyan, 1);
    p.text('horizontal velocity', 54, y, COLORS.cyan);
    y += 20;
    arrow(c, 32, y + 8, 32, y - 8, COLORS.coral, 1);
    p.text('vertical velocity', 54, y, COLORS.coral);
    y += 20;
  }
  if (layers.strobe) {
    c.strokeStyle = COLORS.ink;
    c.fillStyle = COLORS.night;
    c.beginPath();
    c.arc(32, y, 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    p.text('position every 0.2 s', 54, y, COLORS.ink);
  }
  void MONO;
}
