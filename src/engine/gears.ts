import type { AABB } from './types';

/**
 * LumenLab mechanism engine: a gear train as a graph of rigid constraints.
 *
 * - Two gears mesh when the distance between their centres equals the sum of
 *   their radii (teeth touch). Closer than that they would overlap, which the
 *   editor does not allow.
 * - Meshing gears turn in opposite directions, and their rim speeds match:
 *   ω₂ = −ω₁ · r₁ / r₂.
 * - Motion is propagated from the motor by breadth-first search. If the search
 *   reaches a gear that already has a different speed, the constraints conflict
 *   (an odd loop of meshes) and the whole connected train locks.
 * Rotation is purely kinematic: no torque, friction or inertia.
 */

export type GearSize = 'small' | 'medium' | 'large';

export interface GearsWorld {
  engine: 'gears';
  theme: 'lab';
  view: { minX: number; minY: number; width: number; height: number };
  /** Gears may be placed on pegs every `step` units inside these limits. */
  pegs: { minX: number; maxX: number; minY: number; maxY: number; step: number };
  radius: Record<GearSize, number>;
  teeth: Record<GearSize, number>;
  motor: { x: number; y: number; size: GearSize; rpm: number };
  output: { x: number; y: number };
  obstacles: AABB[];
  duration: number;
}

export interface GearsConfig {
  kind: 'gears';
  gears: { x: number; y: number; size: GearSize }[];
  outputSize: GearSize;
}

export interface Gear {
  id: string;
  x: number;
  y: number;
  size: GearSize;
  r: number;
  teeth: number;
  role: 'motor' | 'output' | 'idler';
}

export interface GearsAnalysis {
  gears: Gear[];
  meshes: [number, number][];
  /** rpm per gear, clockwise positive. null = not driven. 0 when jammed. */
  rpm: (number | null)[];
  /** Starting tooth angle per gear so that meshing teeth interleave (radians). */
  phase: number[];
  jammed: boolean;
  /** Gears on the conflicting loop, when jammed. */
  jamLoop: number[];
  connected: boolean;
  outputRpm: number | null;
  /** Gear indices from motor to output along the first path found. */
  path: number[];
}

export interface GearsResult {
  analysis: GearsAnalysis;
  duration: number;
}

const EPS = 1e-9;

export function gearsOf(world: GearsWorld, config: GearsConfig): Gear[] {
  const mk = (id: string, x: number, y: number, size: GearSize, role: Gear['role']): Gear => ({
    id,
    x,
    y,
    size,
    r: world.radius[size],
    teeth: world.teeth[size],
    role,
  });
  return [
    mk('Motor', world.motor.x, world.motor.y, world.motor.size, 'motor'),
    mk('Output', world.output.x, world.output.y, config.outputSize, 'output'),
    ...config.gears.map((g, i) => mk(`G${i + 1}`, g.x, g.y, g.size, 'idler')),
  ];
}

function circleHitsBox(x: number, y: number, r: number, b: AABB) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cy = Math.max(b.minY, Math.min(y, b.maxY));
  return Math.hypot(x - cx, y - cy) < r - EPS;
}

export type Placement = { ok: true; meshesWith: string[] } | { ok: false; reason: string };

/** Can a gear of this size go on this peg, given the gears already there? */
export function checkPlacement(world: GearsWorld, config: GearsConfig, x: number, y: number, size: GearSize): Placement {
  const p = world.pegs;
  const onPeg = (v: number, min: number) => Math.abs((v - min) / p.step - Math.round((v - min) / p.step)) < 1e-9;
  if (!onPeg(x, p.minX) || !onPeg(y, p.minY) || x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) {
    return { ok: false, reason: 'That is outside the frame.' };
  }
  const r = world.radius[size];
  if (world.obstacles.some((o) => circleHitsBox(x, y, r, o))) return { ok: false, reason: 'That would hit the housing.' };
  const meshesWith: string[] = [];
  for (const g of gearsOf(world, config)) {
    const d = Math.hypot(g.x - x, g.y - y);
    if (d < EPS) return { ok: false, reason: `${g.id === 'Motor' || g.id === 'Output' ? 'The ' + g.id.toLowerCase() : g.id} is already on that peg.` };
    if (d < g.r + r - EPS) return { ok: false, reason: `It would overlap ${g.role === 'idler' ? g.id : 'the ' + g.id.toLowerCase()}.` };
    if (Math.abs(d - (g.r + r)) < EPS) meshesWith.push(g.id);
  }
  return { ok: true, meshesWith };
}

export function analyzeGears(world: GearsWorld, config: GearsConfig): GearsAnalysis {
  const gears = gearsOf(world, config);
  const n = gears.length;
  const meshes: [number, number][] = [];
  const adj: number[][] = gears.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(gears[i].x - gears[j].x, gears[i].y - gears[j].y);
      if (Math.abs(d - (gears[i].r + gears[j].r)) < EPS) {
        meshes.push([i, j]);
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  const rpm: (number | null)[] = gears.map(() => null);
  const phase: number[] = gears.map(() => 0);
  const parent: number[] = gears.map(() => -1);
  rpm[0] = world.motor.rpm;
  const queue = [0];
  let jammed = false;
  let jamLoop: number[] = [];

  const pathTo = (i: number) => {
    const out: number[] = [];
    for (let k = i; k !== -1; k = parent[k]) out.unshift(k);
    return out;
  };

  while (queue.length && !jammed) {
    const i = queue.shift()!;
    for (const j of adj[i]) {
      const expected = (-rpm[i]! * gears[i].r) / gears[j].r;
      if (rpm[j] === null) {
        rpm[j] = expected;
        parent[j] = i;
        // Interleave teeth: rotate gear j so a gap faces gear i's tooth.
        // Angles are measured clockwise on screen (y down), matching the renderer.
        const phi = Math.atan2(-(gears[j].y - gears[i].y), gears[j].x - gears[i].x);
        phase[j] = -(gears[i].r / gears[j].r) * (phase[i] - phi) + phi + Math.PI + Math.PI / gears[j].teeth;
        queue.push(j);
      } else if (Math.abs(rpm[j]! - expected) > 1e-6) {
        jammed = true;
        const a = pathTo(i);
        const b = pathTo(j);
        jamLoop = [...new Set([...a, ...b])];
        break;
      }
    }
  }

  const connected = rpm[1] !== null;
  if (jammed) for (let i = 0; i < n; i++) if (rpm[i] !== null) rpm[i] = 0;

  return {
    gears,
    meshes,
    rpm,
    phase,
    jammed,
    jamLoop,
    connected,
    outputRpm: rpm[1],
    path: connected ? pathTo(1) : [],
  };
}

export function simulateGears(world: GearsWorld, config: GearsConfig): GearsResult {
  return { analysis: analyzeGears(world, config), duration: world.duration };
}

/** Angle of gear i at time t, radians, clockwise positive (matches canvas rotation). */
export function gearAngle(a: GearsAnalysis, i: number, t: number): number {
  const w = a.rpm[i] ?? 0;
  return a.phase[i] + (w * 2 * Math.PI * t) / 60;
}
