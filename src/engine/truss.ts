import { solveLinear } from './linalg';

/**
 * LumenLab bridge engine: a 2D pin-jointed truss.
 *
 * Model
 * - Joints are pins; beams only carry axial force (tension = pulled, compression = pushed).
 * - Static analysis uses the direct stiffness method: build K·u = F, solve for joint
 *   displacements u, then each beam's force = (EA/L) × its change in length.
 * - Because the model is linear, the load at which a beam reaches its limit is
 *   limit / (force at full load). The weakest beam breaks, it is removed, and the
 *   structure is re-solved. This repeats until the bridge carries the full load or
 *   the stiffness matrix becomes singular (a mechanism: it can fold).
 * - A collapse is then animated with position-based dynamics (Verlet + rigid beam
 *   constraints). That part is only for showing what happens; the verdict comes
 *   from the static analysis.
 */

export interface BridgeWorld {
  engine: 'bridge';
  theme: 'lab';
  view: { minX: number; minY: number; width: number; height: number };
  /** Allowed joint positions: every multiple of `step` inside these limits. */
  grid: { minX: number; maxX: number; minY: number; maxY: number; step: number };
  /** Joints fixed to the cliffs. */
  anchors: string[];
  /** Road joints in order; consecutive pairs are prebuilt road beams. */
  deck: string[];
  maxBeamLength: number;
  /** Total metres of beam the learner may add. */
  budget: number;
  member: { EA: number; tensionLimit: number; compressionLimit: number };
  vehicle: { node: string; force: number; label: string };
  /** Weight of the road itself at each interior road joint, kN. */
  deckLoad: number;
  waterY: number;
}

export interface BridgeConfig {
  kind: 'bridge';
  /** Beams the learner added, as pairs of joint keys "x,y". */
  beams: [string, string][];
}

export interface Member {
  id: string;
  a: string;
  b: string;
  deck: boolean;
  length: number;
}

export type Mode = 'tension' | 'compression';

export interface FailureEvent {
  /** Fraction of full load at which it happened, 0..1. */
  f: number;
  memberId: string;
  mode: Mode;
  /** Force in the beam at that moment, kN (tension positive). */
  force: number;
}

export interface Stage {
  fromF: number;
  active: string[];
  /** Joint displacements (m) at FULL load for this stage, keyed by joint. */
  disp: Record<string, [number, number]>;
  /** Beam forces (kN) at full load for this stage. */
  forces: Record<string, number>;
}

export interface BridgeAnalysis {
  nodes: string[];
  members: Member[];
  stages: Stage[];
  events: FailureEvent[];
  collapse: { f: number; node: string } | null;
  /** Largest force / limit ratio in the intact bridge at full load (if it could be solved). */
  maxUtilisation: { memberId: string; ratio: number; mode: Mode } | null;
  /** Vertical deflection of the vehicle joint in the intact bridge at full load, m (positive = down). */
  sag: number | null;
}

export interface BridgeFrame {
  t: number;
  /** Flat [x0, y0, x1, y1, ...] in the order of analysis.nodes. */
  pos: number[];
  broken: string[];
  load: number;
  /** Height of the vehicle above the road while it is lowered on. */
  lift: number;
}

export interface BridgeResult {
  analysis: BridgeAnalysis;
  frames: BridgeFrame[];
  /** Drawn deflection = real deflection × this, stated on screen. */
  exaggeration: number;
  duration: number;
}

export const key = (x: number, y: number) => `${x},${y}`;
export function parseKey(k: string): [number, number] {
  const [x, y] = k.split(',').map(Number);
  return [x, y];
}
export const beamLength = (a: string, b: string) => {
  const [ax, ay] = parseKey(a);
  const [bx, by] = parseKey(b);
  return Math.hypot(bx - ax, by - ay);
};

export function isGridPoint(world: BridgeWorld, k: string): boolean {
  const [x, y] = parseKey(k);
  const g = world.grid;
  const onStep = (v: number, min: number) => Math.abs((v - min) / g.step - Math.round((v - min) / g.step)) < 1e-9;
  return x >= g.minX && x <= g.maxX && y >= g.minY && y <= g.maxY && onStep(x, g.minX) && onStep(y, g.minY);
}

/** Joints inside solid cliff rock cannot be used, apart from the anchors on the cliff face. */
export function isUsablePoint(world: BridgeWorld, k: string): boolean {
  if (!isGridPoint(world, k)) return false;
  if (world.anchors.includes(k)) return true;
  const [x, y] = parseKey(k);
  const onCliffFace = (x === world.grid.minX || x === world.grid.maxX) && y < 0;
  return !onCliffFace;
}

export const materialUsed = (config: BridgeConfig) => config.beams.reduce((s, [a, b]) => s + beamLength(a, b), 0);

export function membersOf(world: BridgeWorld, config: BridgeConfig): Member[] {
  const out: Member[] = [];
  for (let i = 0; i + 1 < world.deck.length; i++) {
    const a = world.deck[i];
    const b = world.deck[i + 1];
    out.push({ id: `R${i + 1}`, a, b, deck: true, length: beamLength(a, b) });
  }
  config.beams.forEach(([a, b], i) => {
    out.push({ id: `B${String(i + 1).padStart(2, '0')}`, a, b, deck: false, length: beamLength(a, b) });
  });
  return out;
}

function nodesOf(world: BridgeWorld, members: Member[]): string[] {
  const set = new Set<string>(world.deck);
  for (const m of members) {
    set.add(m.a);
    set.add(m.b);
  }
  // Deterministic order: by x, then y.
  return [...set].sort((p, q) => {
    const [px, py] = parseKey(p);
    const [qx, qy] = parseKey(q);
    return px - qx || py - qy;
  });
}

function fullLoads(world: BridgeWorld): Record<string, number> {
  const loads: Record<string, number> = {};
  for (let i = 1; i < world.deck.length - 1; i++) loads[world.deck[i]] = world.deckLoad;
  loads[world.vehicle.node] = (loads[world.vehicle.node] ?? 0) + world.vehicle.force;
  return loads;
}

type StaticResult =
  | { ok: true; disp: Record<string, [number, number]>; forces: Record<string, number> }
  | { ok: false; node: string };

/** Direct stiffness method at full load. */
export function solveStatics(world: BridgeWorld, nodes: string[], members: Member[]): StaticResult {
  const free = nodes.filter((n) => !world.anchors.includes(n));
  const index = new Map(free.map((n, i) => [n, i]));
  const size = free.length * 2;
  if (size === 0) return { ok: true, disp: {}, forces: Object.fromEntries(members.map((m) => [m.id, 0])) };
  const K = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const F = new Array<number>(size).fill(0);

  for (const m of members) {
    const [ax, ay] = parseKey(m.a);
    const [bx, by] = parseKey(m.b);
    const c = (bx - ax) / m.length;
    const s = (by - ay) / m.length;
    const k = world.member.EA / m.length;
    const local = [
      [c * c, c * s],
      [c * s, s * s],
    ];
    const dofs: [number | undefined, number][] = [
      [index.get(m.a), 1],
      [index.get(m.b), -1],
    ];
    for (const [i, si] of dofs) {
      if (i === undefined) continue;
      for (const [j, sj] of dofs) {
        if (j === undefined) continue;
        for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) K[2 * i + r][2 * j + q] += si * sj * k * local[r][q];
      }
    }
  }

  const loads = fullLoads(world);
  for (const [n, f] of Object.entries(loads)) {
    const i = index.get(n);
    if (i !== undefined) F[2 * i + 1] -= f;
  }

  const sol = solveLinear(K, F);
  if (!sol.ok) return { ok: false, node: free[Math.floor(sol.singularColumn / 2)] };

  const disp: Record<string, [number, number]> = {};
  for (const n of nodes) {
    const i = index.get(n);
    disp[n] = i === undefined ? [0, 0] : [sol.x[2 * i], sol.x[2 * i + 1]];
  }
  const forces: Record<string, number> = {};
  for (const m of members) {
    const [ax, ay] = parseKey(m.a);
    const [bx, by] = parseKey(m.b);
    const c = (bx - ax) / m.length;
    const s = (by - ay) / m.length;
    const du = disp[m.b][0] - disp[m.a][0];
    const dv = disp[m.b][1] - disp[m.a][1];
    forces[m.id] = (world.member.EA / m.length) * (c * du + s * dv);
  }
  return { ok: true, disp, forces };
}

export function analyzeBridge(world: BridgeWorld, config: BridgeConfig): BridgeAnalysis {
  const members = membersOf(world, config);
  const nodes = nodesOf(world, members);
  const { tensionLimit, compressionLimit } = world.member;
  const limitOf = (force: number) => (force >= 0 ? tensionLimit : compressionLimit);

  const stages: Stage[] = [];
  const events: FailureEvent[] = [];
  let collapse: BridgeAnalysis['collapse'] = null;
  let maxUtilisation: BridgeAnalysis['maxUtilisation'] = null;
  let sag: number | null = null;
  let active = members;
  let f0 = 0;

  for (let guard = 0; guard <= members.length; guard++) {
    const sol = solveStatics(world, nodes, active);
    if (!sol.ok) {
      collapse = { f: f0, node: sol.node };
      break;
    }
    stages.push({ fromF: f0, active: active.map((m) => m.id), disp: sol.disp, forces: sol.forces });

    if (guard === 0) {
      for (const m of active) {
        const F = sol.forces[m.id];
        const ratio = Math.abs(F) / limitOf(F);
        if (!maxUtilisation || ratio > maxUtilisation.ratio) {
          maxUtilisation = { memberId: m.id, ratio, mode: F >= 0 ? 'tension' : 'compression' };
        }
      }
      sag = -sol.disp[world.vehicle.node][1];
    }

    let fmin = Infinity;
    let weakest: Member | null = null;
    for (const m of active) {
      const F = sol.forces[m.id];
      if (Math.abs(F) < 1e-12) continue;
      const fc = limitOf(F) / Math.abs(F);
      if (fc < fmin) {
        fmin = fc;
        weakest = m;
      }
    }
    if (!weakest || fmin > 1) break;

    const f = Math.max(fmin, f0);
    const F = sol.forces[weakest.id];
    events.push({ f, memberId: weakest.id, mode: F >= 0 ? 'tension' : 'compression', force: F * f });
    active = active.filter((m) => m !== weakest);
    f0 = f;
  }

  return { nodes, members, stages, events, collapse, maxUtilisation, sag };
}

// ── animation ─────────────────────────────────────────────────────────────

const FRAME = 1 / 60;
/** Seconds spent lowering the truck, and ramping from zero to full load. */
export const DESCEND = 1.1;
export const RAMP = 2.6;
const HOLD = 1.0;
const COLLAPSE = 3.0;
const G = 9.81;

export function simulateBridge(world: BridgeWorld, config: BridgeConfig): BridgeResult {
  const analysis = analyzeBridge(world, config);
  const { nodes, members, stages, events, collapse } = analysis;
  const base = nodes.map(parseKey);

  // Choose an exaggeration so the intact bridge visibly sags about 0.35 m at full load.
  const first = stages[0];
  let maxDisp = 0;
  if (first) for (const n of nodes) maxDisp = Math.max(maxDisp, Math.hypot(...first.disp[n]));
  const exaggeration = maxDisp > 0 ? Math.round(0.35 / maxDisp) : 1;

  const stageAt = (f: number) => {
    let s = stages[0];
    for (const st of stages) if (st.fromF <= f + 1e-12) s = st;
    return s;
  };
  const posAt = (f: number): number[] => {
    const st = stageAt(f);
    const out: number[] = [];
    nodes.forEach((n, i) => {
      const d = st ? st.disp[n] : [0, 0];
      let dx = d[0] * f * exaggeration;
      let dy = d[1] * f * exaggeration;
      const len = Math.hypot(dx, dy);
      if (len > 1.2) {
        dx *= 1.2 / len;
        dy *= 1.2 / len;
      }
      out.push(base[i][0] + dx, base[i][1] + dy);
    });
    return out;
  };
  const brokenAt = (f: number) => events.filter((e) => e.f <= f + 1e-12).map((e) => e.memberId);

  const frames: BridgeFrame[] = [];
  const endF = collapse ? collapse.f : 1;
  const rampTime = RAMP * Math.max(endF, 0.02);

  // 1. The vehicle is lowered onto the road.
  for (let t = 0; t < DESCEND; t += FRAME) {
    const k = t / DESCEND;
    frames.push({ t, pos: posAt(0), broken: [], load: 0, lift: 3 * (1 - k * k * (3 - 2 * k)) });
  }
  // 2. Load ramps from 0 to full (or to the collapse point).
  for (let t = 0; t <= rampTime + 1e-9; t += FRAME) {
    const f = Math.min(endF, t / RAMP);
    frames.push({ t: DESCEND + t, pos: posAt(f), broken: brokenAt(f), load: f, lift: 0 });
  }
  let t = frames[frames.length - 1].t;

  if (!collapse) {
    // 3a. It holds.
    const last = frames[frames.length - 1];
    for (let h = FRAME; h <= HOLD; h += FRAME) frames.push({ ...last, t: t + h });
  } else {
    // 3b. Mechanism: animate the fall with position-based dynamics.
    const broken = brokenAt(endF);
    const alive = members.filter((m) => !broken.includes(m.id));
    const idx = new Map(nodes.map((n, i) => [n, i]));
    const pos = posAt(endF);
    const prev = [...pos];
    const invMass = nodes.map((n) => (world.anchors.includes(n) ? 0 : n === world.vehicle.node ? 0.25 : 1));
    const links = alive.map((m) => ({ id: m.id, a: idx.get(m.a)!, b: idx.get(m.b)!, rest: m.length, alive: true }));
    const snapped: string[] = [];
    const h = 1 / 120;
    const { minX, maxX } = world.grid;
    for (let step = 1; step <= Math.round(COLLAPSE / h); step++) {
      for (let i = 0; i < nodes.length; i++) {
        if (invMass[i] === 0) continue;
        const vx = (pos[2 * i] - prev[2 * i]) * 0.995;
        const vy = (pos[2 * i + 1] - prev[2 * i + 1]) * 0.995;
        prev[2 * i] = pos[2 * i];
        prev[2 * i + 1] = pos[2 * i + 1];
        pos[2 * i] += vx;
        pos[2 * i + 1] += vy - G * h * h;
      }
      for (let it = 0; it < 3; it++) {
        for (const l of links) {
          if (!l.alive) continue;
          const wa = invMass[l.a];
          const wb = invMass[l.b];
          if (wa + wb === 0) continue;
          const dx = pos[2 * l.b] - pos[2 * l.a];
          const dy = pos[2 * l.b + 1] - pos[2 * l.a + 1];
          const len = Math.hypot(dx, dy) || 1e-9;
          const diff = ((len - l.rest) / len / (wa + wb)) * 0.5;
          pos[2 * l.a] += dx * diff * wa;
          pos[2 * l.a + 1] += dy * diff * wa;
          pos[2 * l.b] -= dx * diff * wb;
          pos[2 * l.b + 1] -= dy * diff * wb;
        }
        for (let i = 0; i < nodes.length; i++) {
          if (invMass[i] === 0) continue;
          let x = pos[2 * i];
          let y = pos[2 * i + 1];
          if (y < world.waterY) {
            y = world.waterY;
            prev[2 * i] = x - (x - prev[2 * i]) * 0.3;
          }
          // Cliff rock: left of minX and right of maxX below road level.
          if (y < 0 && x < minX) {
            if (minX - x < -y) x = minX;
            else y = 0;
          }
          if (y < 0 && x > maxX) {
            if (x - maxX < -y) x = maxX;
            else y = 0;
          }
          pos[2 * i] = x;
          pos[2 * i + 1] = y;
        }
      }
      // A mechanism that can only move by stretching beams (e.g. three hinges in a
      // straight line) tears those beams apart as it sags.
      for (const l of links) {
        if (!l.alive) continue;
        const len = Math.hypot(pos[2 * l.b] - pos[2 * l.a], pos[2 * l.b + 1] - pos[2 * l.a + 1]);
        if (Math.abs(len - l.rest) / l.rest > 0.006) {
          l.alive = false;
          snapped.push(l.id);
        }
      }
      if (step % 2 === 0) frames.push({ t: t + step * h, pos: [...pos], broken: [...broken, ...snapped], load: endF, lift: 0 });
    }
    t += COLLAPSE;
  }

  return { analysis, frames, exaggeration, duration: frames[frames.length - 1].t };
}

/** The frame shown at playback time t (frames are ~1/60 s apart). */
export function frameAt(result: BridgeResult, t: number): BridgeFrame {
  const f = result.frames;
  let lo = 0;
  let hi = f.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (f[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return f[lo];
}
