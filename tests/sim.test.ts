import { describe, expect, it } from 'vitest';
import { contactAt, simulateProjectile } from '../src/engine/projectile';
import type { ProjectileWorld } from '../src/engine/types';
import { projectileLesson } from '../src/lessons/projectile';

const world = projectileLesson.world as ProjectileWorld;

describe('projectile engine', () => {
  it('is deterministic: same world and config give identical frames', () => {
    const a = simulateProjectile(world, { angleDeg: 40, speed: 15 });
    const b = simulateProjectile(world, { angleDeg: 40, speed: 15 });
    expect(b).toEqual(a);
  });

  it('matches the analytic trajectory under constant gravity', () => {
    const r = simulateProjectile(world, { angleDeg: 55, speed: 14 });
    const i = r.initial;
    for (const f of r.frames) {
      expect(f.x).toBeCloseTo(i.x + i.vx * f.t, 9);
      expect(f.y).toBeCloseTo(i.y + i.vy * f.t - 0.5 * world.gravity * f.t * f.t, 9);
      expect(f.vx).toBe(i.vx);
    }
  });

  it('ends a weak shot on the ground without sinking into it', () => {
    const r = simulateProjectile(world, { angleDeg: 30, speed: 8 });
    expect(r.outcome.kind).toBe('ground');
    expect(r.outcome.y).toBeGreaterThanOrEqual(world.ball.radius - 1e-6);
    expect(r.outcome.y).toBeLessThan(world.ball.radius + 1e-6);
  });

  it('reports the exact first contact, not a point past it', () => {
    const r = simulateProjectile(world, { angleDeg: 45, speed: 16 });
    const before = r.frames[r.frames.length - 2];
    expect(contactAt(world, before)).toBeNull();
    expect(contactAt(world, r.outcome)).not.toBeNull();
  });

  it('computes the apex where vertical velocity is zero', () => {
    const r = simulateProjectile(world, { angleDeg: 60, speed: 12 });
    expect(r.apex).not.toBeNull();
    expect(Math.abs(r.apex!.vy)).toBeLessThan(1e-9);
  });

  it('never produces NaN or Infinity anywhere in the control range', () => {
    for (let a = 10; a <= 80; a += 5) {
      for (let v = 8; v <= 20; v += 2) {
        const r = simulateProjectile(world, { angleDeg: a, speed: v });
        for (const f of r.frames) {
          expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.t)).toBe(true);
        }
      }
    }
  });
});
