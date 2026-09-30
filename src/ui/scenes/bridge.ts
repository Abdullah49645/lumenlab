import {
  DESCEND,
  RAMP,
  frameAt,
  isUsablePoint,
  membersOf,
  parseKey,
  type BridgeConfig,
  type BridgeResult,
  type BridgeWorld,
  type Member,
} from '../../engine/truss';
import { forcesAt } from '../../experiments/bridge';
import { COLORS, roundRect, type Painter } from '../renderer';

export interface BridgeScene {
  kind: 'bridge';
  world: BridgeWorld;
  config: BridgeConfig;
  /** When set, positions and broken beams come from this result at `time`. */
  result: BridgeResult | null;
  time: number;
  mode: 'build' | 'predict' | 'play';
  showForces: boolean;
  showLabels: boolean;
  hover: string | null;
  pending: string | null;
  previewValid: boolean;
  cursor: string | null;
  predictedMember: string | null;
  highlightMembers: string[];
  highlightNode: string | null;
  /** Wall-clock seconds, only for gentle pulsing of highlights. */
  clock: number;
}

const STEEL = '#b5bec8';

export function drawBridge(p: Painter, s: BridgeScene) {
  const w = s.world;
  const v = w.view;
  p.grid(v.minX, v.minX + v.width, w.waterY, v.minY + v.height, 1, 2);
  water(p, w, s.clock);
  cliffs(p, w);

  const members = s.result ? s.result.analysis.members : membersOf(w, s.config);
  const frame = s.result ? frameAt(s.result, s.time) : null;
  const nodes = s.result ? s.result.analysis.nodes : null;
  const posOf = (k: string): [number, number] => {
    if (frame && nodes) {
      const i = nodes.indexOf(k);
      if (i >= 0) return [frame.pos[2 * i], frame.pos[2 * i + 1]];
    }
    return parseKey(k);
  };

  if (s.mode !== 'play') points(p, s);

  const forces = s.result && frame ? forcesAt(s.result, frame.load) : {};
  const broken = new Set(frame?.broken ?? []);
  for (const m of members) {
    if (broken.has(m.id)) continue;
    beam(p, s, m, posOf(m.a), posOf(m.b), forces[m.id] ?? 0);
  }

  // Snap flashes for beams that broke in the last 0.4 s.
  if (s.result && frame) {
    for (const e of s.result.analysis.events) {
      const tBreak = DESCEND + e.f * RAMP;
      const age = s.time - tBreak;
      if (age < 0 || age > 0.45) continue;
      const m = members.find((x) => x.id === e.memberId)!;
      const [ax, ay] = posOf(m.a);
      const [bx, by] = posOf(m.b);
      const cx = p.sx((ax + bx) / 2);
      const cy = p.sy((ay + by) / 2);
      const k = age / 0.45;
      p.ctx.strokeStyle = `rgba(255,138,110,${1 - k})`;
      p.ctx.lineWidth = 2;
      p.ctx.beginPath();
      p.ctx.arc(cx, cy, 6 + 30 * k, 0, Math.PI * 2);
      p.ctx.stroke();
    }
  }

  joints(p, s, members, posOf);
  if (s.pending && s.hover && s.pending !== s.hover && s.mode === 'build') preview(p, s);
  truck(p, s, posOf, frame?.lift ?? 0, frame?.load ?? 0);
  if (s.showLabels) labels(p, s, members, posOf, broken);
  if (s.highlightNode) {
    const [x, y] = posOf(s.highlightNode);
    const pulse = 0.5 + 0.5 * Math.sin(s.clock * 5);
    p.ctx.strokeStyle = COLORS.coral;
    p.ctx.lineWidth = 2;
    p.ctx.beginPath();
    p.ctx.arc(p.sx(x), p.sy(y), 10 + 6 * pulse, 0, Math.PI * 2);
    p.ctx.stroke();
  }
  if (s.showForces && s.result) legend(p);
}

function water(p: Painter, w: BridgeWorld, clock: number) {
  const c = p.ctx;
  const top = p.sy(w.waterY);
  const g = c.createLinearGradient(0, top, 0, p.cssH);
  g.addColorStop(0, 'rgba(38,78,104,0.55)');
  g.addColorStop(1, 'rgba(10,22,34,0.9)');
  c.fillStyle = g;
  c.fillRect(0, top, p.cssW, p.cssH - top);
  c.strokeStyle = 'rgba(111,207,224,0.35)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= p.cssW; x += 6) {
    const y = top + Math.sin(x / 22 + clock * 1.3) * 1.5;
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
}

function cliffs(p: Painter, w: BridgeWorld) {
  const c = p.ctx;
  const top = p.sy(0);
  const bottom = p.cssH;
  const left = p.sx(w.grid.minX);
  const right = p.sx(w.grid.maxX);
  for (const [x0, x1] of [
    [0, left],
    [right, p.cssW],
  ]) {
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#263647');
    g.addColorStop(1, '#111b25');
    c.fillStyle = g;
    c.fillRect(x0, top, x1 - x0, bottom - top);
    c.save();
    c.beginPath();
    c.rect(x0, top, x1 - x0, bottom - top);
    c.clip();
    c.strokeStyle = 'rgba(233,230,221,0.05)';
    for (let d = -400; d < 800; d += 12) {
      c.beginPath();
      c.moveTo(x0 + d, top);
      c.lineTo(x0 + d - (bottom - top), bottom);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(245,184,74,0.45)';
    c.beginPath();
    c.moveTo(x0, Math.round(top) + 0.5);
    c.lineTo(x1, Math.round(top) + 0.5);
    c.stroke();
  }
  // Metre labels along the gap.
  for (let x = w.grid.minX; x <= w.grid.maxX; x += w.grid.step) {
    p.text(x === w.grid.maxX ? `${x} m` : `${x}`, p.sx(x), p.sy(w.waterY) + 14, COLORS.muted, 'center');
  }
}

function points(p: Painter, s: BridgeScene) {
  const c = p.ctx;
  const g = s.world.grid;
  for (let x = g.minX; x <= g.maxX; x += g.step) {
    for (let y = g.minY; y <= g.maxY; y += g.step) {
      const k = `${x},${y}`;
      if (!isUsablePoint(s.world, k)) continue;
      const px = p.sx(x);
      const py = p.sy(y);
      const hot = s.hover === k && s.mode === 'build';
      c.fillStyle = hot ? COLORS.lumen : 'rgba(233,230,221,0.35)';
      c.beginPath();
      c.arc(px, py, hot ? 5 : 2.5, 0, Math.PI * 2);
      c.fill();
      if (s.cursor === k) {
        c.strokeStyle = COLORS.ink;
        c.lineWidth = 1.5;
        c.strokeRect(px - 9, py - 9, 18, 18);
      }
    }
  }
}

function utilColor(u: number): string {
  // Neutral steel → lumen amber → hot red as a beam approaches its limit.
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const steel = [181, 190, 200];
  const amber = [245, 184, 74];
  const red = [255, 90, 70];
  const k = Math.max(0, Math.min(1, u));
  const rgb = k < 0.5 ? steel : k < 0.85 ? lerp(steel, amber, (k - 0.5) / 0.35) : lerp(amber, red, (k - 0.85) / 0.15);
  return `rgb(${rgb.join(',')})`;
}

function beam(p: Painter, s: BridgeScene, m: Member, a: [number, number], b: [number, number], force: number) {
  const c = p.ctx;
  const { tensionLimit, compressionLimit } = s.world.member;
  const u = Math.abs(force) / (force >= 0 ? tensionLimit : compressionLimit);
  const x1 = p.sx(a[0]);
  const y1 = p.sy(a[1]);
  const x2 = p.sx(b[0]);
  const y2 = p.sy(b[1]);
  const highlighted = s.highlightMembers.includes(m.id) || s.predictedMember === m.id;

  if (highlighted) {
    c.strokeStyle = s.predictedMember === m.id && s.mode === 'predict' ? 'rgba(233,230,221,0.55)' : 'rgba(255,138,110,0.45)';
    c.lineWidth = m.deck ? 16 : 12;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  let color = m.deck ? '#3a4652' : STEEL;
  let width = m.deck ? 7 : 4;
  if (s.result && s.mode === 'play') {
    if (s.showForces && Math.abs(force) > 1e-6) {
      color = force >= 0 ? COLORS.cyan : COLORS.coral;
      width = 2 + 7 * Math.min(1, u);
    } else if (!m.deck) {
      color = utilColor(u);
    }
  }
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(5,10,15,0.6)';
  c.lineWidth = width + 2;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  if (m.deck) {
    c.strokeStyle = 'rgba(245,184,74,0.35)';
    c.lineWidth = 1;
    c.setLineDash([6, 6]);
    c.beginPath();
    c.moveTo(x1, y1 - 0.5);
    c.lineTo(x2, y2 - 0.5);
    c.stroke();
    c.setLineDash([]);
  }
  c.lineCap = 'butt';
}

function joints(p: Painter, s: BridgeScene, members: Member[], posOf: (k: string) => [number, number]) {
  const c = p.ctx;
  const seen = new Set<string>();
  for (const m of members) for (const k of [m.a, m.b]) seen.add(k);
  for (const k of s.world.anchors) seen.add(k);
  for (const k of seen) {
    const [x, y] = posOf(k);
    const anchor = s.world.anchors.includes(k);
    c.fillStyle = anchor ? COLORS.lumen : COLORS.night;
    c.strokeStyle = anchor ? COLORS.lumen : STEEL;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(p.sx(x), p.sy(y), anchor ? 4.5 : 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (s.pending === k) {
      c.strokeStyle = COLORS.lumen;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(p.sx(x), p.sy(y), 10, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (s.pending && !seen.has(s.pending)) {
    const [x, y] = parseKey(s.pending);
    c.strokeStyle = COLORS.lumen;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.sx(x), p.sy(y), 10, 0, Math.PI * 2);
    c.stroke();
  }
}

function preview(p: Painter, s: BridgeScene) {
  const c = p.ctx;
  const [ax, ay] = parseKey(s.pending!);
  const [bx, by] = parseKey(s.hover!);
  c.save();
  c.setLineDash([5, 5]);
  c.strokeStyle = s.previewValid ? 'rgba(245,184,74,0.8)' : 'rgba(255,138,110,0.7)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(p.sx(ax), p.sy(ay));
  c.lineTo(p.sx(bx), p.sy(by));
  c.stroke();
  c.restore();
  const len = Math.hypot(bx - ax, by - ay);
  p.pill(`${len.toFixed(2)} m`, p.sx((ax + bx) / 2), p.sy((ay + by) / 2) - 14, s.previewValid ? COLORS.ink : COLORS.coral);
}

function truck(p: Painter, s: BridgeScene, posOf: (k: string) => [number, number], lift: number, load: number) {
  const c = p.ctx;
  // While building, the truck waits on the left cliff.
  const [x, y] = s.mode === 'play' ? posOf(s.world.vehicle.node) : [s.world.grid.minX - 1.4, 0];
  if (s.mode !== 'play') lift = 0;
  const w = 1.8 * p.scale;
  const h = 0.9 * p.scale;
  const px = p.sx(x);
  const py = p.sy(y + lift) - 5;
  c.save();
  if (lift > 0.05) {
    c.strokeStyle = COLORS.faint;
    c.beginPath();
    c.moveTo(px, 0);
    c.lineTo(px, py - h);
    c.stroke();
  }
  const g = c.createLinearGradient(0, py - h, 0, py);
  g.addColorStop(0, '#e2ddd1');
  g.addColorStop(1, '#8f8a80');
  c.fillStyle = g;
  roundRect(c, px - w / 2, py - h, w * 0.68, h, 3);
  c.fill();
  c.fillStyle = COLORS.lumen;
  roundRect(c, px - w / 2 + w * 0.7, py - h * 0.75, w * 0.3, h * 0.75, 3);
  c.fill();
  c.fillStyle = '#1b232c';
  for (const fx of [-0.32, 0.3]) {
    c.beginPath();
    c.arc(px + fx * w, py, h * 0.22, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  const shown = s.mode === 'play' ? `${(load * s.world.vehicle.force).toFixed(0)} of ${s.world.vehicle.force} kN` : `${s.world.vehicle.force} kN`;
  p.text(shown, px, py - h - 8, COLORS.ink, 'center', 'bottom');
}

function labels(p: Painter, s: BridgeScene, members: Member[], posOf: (k: string) => [number, number], broken: Set<string>) {
  for (const m of members) {
    if (broken.has(m.id) && !s.highlightMembers.includes(m.id)) continue;
    const [ax, ay] = posOf(m.a);
    const [bx, by] = posOf(m.b);
    const hot = s.highlightMembers.includes(m.id) || s.predictedMember === m.id;
    p.pill(m.id, p.sx((ax + bx) / 2), p.sy((ay + by) / 2), hot ? COLORS.coral : COLORS.muted);
  }
}

function legend(p: Painter) {
  const c = p.ctx;
  c.lineCap = 'round';
  c.lineWidth = 5;
  c.strokeStyle = COLORS.cyan;
  c.beginPath();
  c.moveTo(18, 22);
  c.lineTo(44, 22);
  c.stroke();
  p.text('pulled (tension)', 54, 22, COLORS.cyan);
  c.strokeStyle = COLORS.coral;
  c.beginPath();
  c.moveTo(18, 42);
  c.lineTo(44, 42);
  c.stroke();
  p.text('pushed (compression)', 54, 42, COLORS.coral);
  p.text('thicker = more force', 18, 62, COLORS.muted);
  c.lineCap = 'butt';
}
