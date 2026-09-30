import { gearAngle, type Gear, type GearSize, type GearsAnalysis, type GearsConfig, type GearsWorld } from '../../engine/gears';
import { COLORS, type Painter } from '../renderer';

export interface GearsScene {
  kind: 'gears';
  world: GearsWorld;
  config: GearsConfig;
  analysis: GearsAnalysis;
  /** Seconds of rotation to show; 0 in the build step. */
  time: number;
  moving: boolean;
  hover: { x: number; y: number; size: GearSize; ok: boolean } | null;
  cursor: { x: number; y: number } | null;
  showSpeeds: boolean;
  highlight: number[];
  clock: number;
}

export function drawGears(p: Painter, s: GearsScene) {
  const w = s.world;
  const v = w.view;
  p.grid(v.minX, v.minX + v.width, v.minY, v.minY + v.height, 1, 4);
  pegs(p, s);
  for (const o of w.obstacles) housing(p, o);

  const a = s.analysis;
  const jam = new Set(a.jammed ? a.jamLoop : []);
  a.gears.forEach((g, i) => {
    let angle = s.moving ? gearAngle(a, i, s.time) : a.phase[i];
    let dx = 0;
    if (s.moving && jam.has(i)) {
      dx = Math.sin(s.clock * 40 + i) * 0.04;
      angle += Math.sin(s.clock * 33 + i) * 0.02;
    }
    gear(p, g, g.x + dx, g.y, angle, s.highlight.includes(i), jam.has(i) && s.moving);
  });

  // Contact points of meshing teeth.
  for (const [i, j] of a.meshes) {
    const gi = a.gears[i];
    const gj = a.gears[j];
    const t = gi.r / (gi.r + gj.r);
    const cx = gi.x + (gj.x - gi.x) * t;
    const cy = gi.y + (gj.y - gi.y) * t;
    p.ctx.fillStyle = COLORS.lumen;
    p.ctx.beginPath();
    p.ctx.arc(p.sx(cx), p.sy(cy), 3, 0, Math.PI * 2);
    p.ctx.fill();
  }

  if (s.moving) {
    a.gears.forEach((g, i) => {
      const rpm = a.rpm[i];
      if (rpm === null || rpm === 0) return;
      spinArrow(p, g, rpm > 0, s.clock);
      if (s.showSpeeds) p.pill(`${Math.abs(rpm).toFixed(0)} rpm ${rpm > 0 ? 'cw' : 'ccw'}`, p.sx(g.x), p.sy(g.y - g.r) + 18, COLORS.coral);
    });
  }

  labels(p, s);
  if (s.hover) ghost(p, s, s.hover);
  if (s.cursor) {
    const px = p.sx(s.cursor.x);
    const py = p.sy(s.cursor.y);
    p.ctx.strokeStyle = COLORS.ink;
    p.ctx.lineWidth = 1.5;
    p.ctx.strokeRect(px - 8, py - 8, 16, 16);
  }
}

function pegs(p: Painter, s: GearsScene) {
  const c = p.ctx;
  const g = s.world.pegs;
  for (let x = g.minX; x <= g.maxX + 1e-9; x += g.step) {
    for (let y = g.minY; y <= g.maxY + 1e-9; y += g.step) {
      const whole = Number.isInteger(x) && Number.isInteger(y);
      c.fillStyle = whole ? 'rgba(233,230,221,0.28)' : 'rgba(233,230,221,0.1)';
      c.beginPath();
      c.arc(p.sx(x), p.sy(y), whole ? 1.8 : 1.1, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function housing(p: Painter, o: { minX: number; minY: number; maxX: number; maxY: number; label: string }) {
  const c = p.ctx;
  const x0 = p.sx(o.minX);
  const x1 = p.sx(o.maxX);
  const y0 = p.sy(o.maxY);
  const y1 = p.sy(o.minY);
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#2e3e4f');
  g.addColorStop(1, '#1a2530');
  c.fillStyle = g;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  c.strokeStyle = 'rgba(233,230,221,0.06)';
  for (let d = -300; d < 600; d += 10) {
    c.beginPath();
    c.moveTo(x0 + d, y0);
    c.lineTo(x0 + d - (y1 - y0), y1);
    c.stroke();
  }
  c.restore();
  c.strokeStyle = 'rgba(233,230,221,0.2)';
  c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  p.text(o.label, (x0 + x1) / 2, (y0 + y1) / 2, COLORS.muted, 'center');
}

function toothPath(p: Painter, cx: number, cy: number, r: number, teeth: number, angle: number) {
  const c = p.ctx;
  const s = p.scale;
  const outer = (r + 0.13) * s;
  const inner = (r - 0.15) * s;
  c.beginPath();
  for (let k = 0; k < teeth; k++) {
    const a0 = angle + (k / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [inner, a0 - step * 0.5],
      [inner, a0 - step * 0.28],
      [outer, a0 - step * 0.16],
      [outer, a0 + step * 0.16],
      [inner, a0 + step * 0.28],
    ];
    for (const [rad, a] of pts) {
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (k === 0 && rad === inner && a === a0 - step * 0.5) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  }
  c.closePath();
}

function gear(p: Painter, g: Gear, x: number, y: number, angle: number, highlighted: boolean, jammed: boolean) {
  const c = p.ctx;
  const cx = p.sx(x);
  const cy = p.sy(y);
  const s = p.scale;
  const base = g.role === 'motor' ? ['#f7d59a', '#b8822c'] : g.role === 'output' ? ['#eeeae0', '#8f8a80'] : ['#c3ccd5', '#6d7985'];

  if (highlighted || jammed) {
    c.fillStyle = jammed ? 'rgba(255,138,110,0.28)' : 'rgba(159,220,174,0.18)';
    c.beginPath();
    c.arc(cx, cy, (g.r + 0.4) * s, 0, Math.PI * 2);
    c.fill();
  }
  const grad = c.createRadialGradient(cx - g.r * s * 0.3, cy - g.r * s * 0.3, g.r * s * 0.1, cx, cy, (g.r + 0.2) * s);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);
  toothPath(p, cx, cy, g.r, g.teeth, angle);
  c.fillStyle = grad;
  c.fill();
  c.strokeStyle = 'rgba(5,10,15,0.55)';
  c.lineWidth = 1;
  c.stroke();

  // Spokes make rotation readable.
  c.save();
  c.translate(cx, cy);
  c.rotate(angle);
  c.fillStyle = 'rgba(10,18,27,0.55)';
  const holes = g.r >= 1.5 ? 5 : 3;
  for (let k = 0; k < holes; k++) {
    const a = (k / holes) * Math.PI * 2;
    c.beginPath();
    c.arc(Math.cos(a) * g.r * 0.55 * s, Math.sin(a) * g.r * 0.55 * s, g.r * 0.2 * s, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  c.fillStyle = COLORS.night;
  c.beginPath();
  c.arc(cx, cy, 0.18 * s, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = g.role === 'motor' ? COLORS.lumen : 'rgba(233,230,221,0.6)';
  c.lineWidth = 1.5;
  c.stroke();
}

function spinArrow(p: Painter, g: Gear, clockwise: boolean, clock: number) {
  const c = p.ctx;
  const cx = p.sx(g.x);
  const cy = p.sy(g.y);
  const r = (g.r + 0.3) * p.scale;
  const start = -Math.PI / 2 - 0.9 + (clockwise ? 0 : 0);
  const end = -Math.PI / 2 + 0.9;
  c.save();
  c.strokeStyle = COLORS.cyan;
  c.lineWidth = 2;
  c.globalAlpha = 0.65 + 0.35 * Math.sin(clock * 4);
  c.beginPath();
  c.arc(cx, cy, r, start, end);
  c.stroke();
  const tipA = clockwise ? end : start;
  const tx = cx + Math.cos(tipA) * r;
  const ty = cy + Math.sin(tipA) * r;
  const dir = clockwise ? tipA + Math.PI / 2 : tipA - Math.PI / 2;
  c.fillStyle = COLORS.cyan;
  c.beginPath();
  c.moveTo(tx + Math.cos(dir) * 7, ty + Math.sin(dir) * 7);
  c.lineTo(tx + Math.cos(dir + 2.4) * 7, ty + Math.sin(dir + 2.4) * 7);
  c.lineTo(tx + Math.cos(dir - 2.4) * 7, ty + Math.sin(dir - 2.4) * 7);
  c.closePath();
  c.fill();
  c.restore();
}

function labels(p: Painter, s: GearsScene) {
  for (const g of s.analysis.gears) {
    const text = g.role === 'motor' ? `Motor, ${s.world.motor.rpm} rpm cw` : g.role === 'output' ? 'Output' : g.id;
    const color = g.role === 'motor' ? COLORS.lumen : g.role === 'output' ? COLORS.ink : COLORS.muted;
    p.text(text, p.sx(g.x), p.sy(g.y + g.r + 0.5) - 6, color, 'center', 'bottom');
  }
}

function ghost(p: Painter, s: GearsScene, h: { x: number; y: number; size: GearSize; ok: boolean }) {
  const c = p.ctx;
  const r = s.world.radius[h.size];
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = h.ok ? COLORS.lumen : COLORS.coral;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(p.sx(h.x), p.sy(h.y), r * p.scale, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}
