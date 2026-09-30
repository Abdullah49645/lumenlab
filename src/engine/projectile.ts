import type { LaunchConfig, ProjectileWorld, Vec2 } from './types';

/**
 * LumenLab projectile engine.
 *
 * - Fixed time step (DT). No wall-clock time ever enters the simulation, so the
 *   same world + same launch config always produces exactly the same frames.
 * - Integration: velocity Verlet. For constant acceleration (uniform gravity,
 *   no drag) it reproduces the textbook equations exactly, which the tests check.
 * - Collision detection: each step is sampled at SUBSTEPS points along the exact
 *   path, and the first contact is refined by bisection. This stops a fast ball
 *   from skipping through thin objects between frames.
 */
export const DT = 1 / 120;
export const SUBSTEPS = 8;
const BISECT_ITERATIONS = 30;

export interface BallState {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type OutcomeKind = 'target' | 'obstacle' | 'ground' | 'out-of-bounds' | 'timeout';

export interface Outcome extends BallState {
  kind: OutcomeKind;
  colliderId: string | null;
}

export interface SimResult {
  initial: BallState;
  /** One frame per DT, plus the exact contact frame at the end. */
  frames: BallState[];
  outcome: Outcome;
  /** Highest point of the flight, or null if the run ended before reaching it. */
  apex: BallState | null;
}

const DEG = Math.PI / 180;

/** Where and how fast the ball leaves the muzzle. */
export function launchState(world: ProjectileWorld, config: LaunchConfig): BallState {
  const a = config.angleDeg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const { x, y, barrelLength } = world.launcher;
  return {
    t: 0,
    x: x + cos * barrelLength,
    y: y + sin * barrelLength,
    vx: config.speed * cos,
    vy: config.speed * sin,
  };
}

/**
 * Advance a state by h seconds under gravity g (velocity Verlet).
 *   x  ← x + vx·h
 *   y  ← y + vy·h − ½·g·h²
 *   vy ← vy − g·h
 */
export function advance(s: BallState, g: number, h: number): BallState {
  return {
    t: s.t + h,
    x: s.x + s.vx * h,
    y: s.y + s.vy * h - 0.5 * g * h * h,
    vx: s.vx,
    vy: s.vy - g * h,
  };
}

interface Contact {
  kind: OutcomeKind;
  id: string | null;
}

/** What, if anything, the ball is touching at point p. Checked in priority order. */
export function contactAt(world: ProjectileWorld, p: Vec2): Contact | null {
  const r = world.ball.radius;
  const tg = world.target;
  if (Math.hypot(p.x - tg.x, p.y - tg.y) <= tg.radius) return { kind: 'target', id: tg.id };
  for (const o of world.obstacles) {
    if (p.x >= o.minX - r && p.x <= o.maxX + r && p.y >= o.minY - r && p.y <= o.maxY + r) {
      return { kind: 'obstacle', id: o.id };
    }
  }
  if (p.y <= r) return { kind: 'ground', id: null };
  const b = world.bounds;
  if (p.x < b.minX || p.x > b.maxX || p.y > b.maxY) return { kind: 'out-of-bounds', id: null };
  return null;
}

export function simulateProjectile(world: ProjectileWorld, config: LaunchConfig): SimResult {
  const g = world.gravity;
  const initial = launchState(world, config);
  const frames: BallState[] = [initial];
  let state = initial;
  const maxSteps = Math.ceil(world.maxTime / DT);
  let outcome: Outcome | null = null;

  for (let step = 0; step < maxSteps && !outcome; step++) {
    let prevS = 0;
    for (let k = 1; k <= SUBSTEPS; k++) {
      const s = (k * DT) / SUBSTEPS;
      if (!contactAt(world, advance(state, g, s))) {
        prevS = s;
        continue;
      }
      // Contact happened somewhere in (prevS, s]. Narrow it down.
      let lo = prevS;
      let hi = s;
      for (let i = 0; i < BISECT_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        if (contactAt(world, advance(state, g, mid))) hi = mid;
        else lo = mid;
      }
      const at = advance(state, g, hi);
      const c = contactAt(world, at)!;
      frames.push(at);
      outcome = { ...at, kind: c.kind, colliderId: c.id };
      break;
    }
    if (!outcome) {
      state = advance(state, g, DT);
      frames.push(state);
    }
  }

  if (!outcome) outcome = { ...state, kind: 'timeout', colliderId: null };

  // Apex: vertical velocity reaches zero at t = vy0 / g.
  let apex: BallState | null = null;
  if (initial.vy > 0 && g > 0) {
    const tApex = initial.vy / g;
    if (tApex <= outcome.t) apex = advance(initial, g, tApex);
  }

  return { initial, frames, outcome, apex };
}

/** Where the unobstructed path crosses the vertical line at x, if it ever does. */
export function stateAtX(initial: BallState, g: number, x: number): BallState | null {
  if (initial.vx <= 0) return null;
  const t = (x - initial.x) / initial.vx;
  if (t < 0) return null;
  return advance(initial, g, t);
}
