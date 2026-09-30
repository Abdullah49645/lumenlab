import { describe, expect, it } from 'vitest';
import { simulateProjectile } from '../src/engine/projectile';
import type { ProjectileWorld } from '../src/engine/types';
import { evaluateProjectile as evaluate } from '../src/evaluator/projectile';
import { moonLesson, projectileLesson } from '../src/lessons/projectile';
import { findSolution, findSolutions } from '../src/lessons/solve';

const L = projectileLesson;
const run = (lesson = L, angleDeg: number, speed: number) => {
  const w = lesson.world as ProjectileWorld;
  return evaluate(w, simulateProjectile(w, { angleDeg, speed }), lesson.successConditions);
};

describe('challenge evaluation', () => {
  it('the Earth lesson is solvable and a solution is detected as a hit', () => {
    const sol = findSolution(L);
    expect(sol).not.toBeNull();
    const ev = run(L, sol!.angleDeg, sol!.speed);
    expect(ev.success).toBe(true);
    expect(ev.verdict).toBe('hit');
  });

  it('the default setup does not already solve the challenge', () => {
    const ev = run(L, 30, 12);
    expect(ev.success).toBe(false);
    expect(ev.verdict).toBe('short');
    expect(ev.measurements.shortBy).toBeGreaterThan(0);
  });

  it('rejects a near miss just above the target', () => {
    const sol = findSolution(L)!;
    let speed = sol.speed;
    let ev = run(L, sol.angleDeg, speed);
    while (ev.success && speed < 20) {
      speed += 0.5;
      ev = run(L, sol.angleDeg, speed);
    }
    expect(ev.success).toBe(false);
    expect(ev.verdict).toBe('over');
    expect(ev.measurements.crossingOffset!).toBeGreaterThan(0);
  });

  it('reports a flat shot that strikes the tower as blocked', () => {
    let found = false;
    for (let a = 10; a <= 40 && !found; a += 1) {
      for (let v = 14; v <= 20 && !found; v += 0.5) {
        const ev = run(L, a, v);
        if (ev.verdict === 'blocked') {
          found = true;
          expect(ev.success).toBe(false);
        }
      }
    }
    expect(found).toBe(true);
  });

  it('transfer: an Earth solution overshoots on the Moon, and the Moon is solvable', () => {
    const earth = findSolutions(L);
    for (const c of earth) {
      const ev = run(moonLesson, c.angleDeg, c.speed);
      expect(ev.success).toBe(false);
      expect(['over', 'lost']).toContain(ev.verdict);
    }
    expect(findSolution(moonLesson)).not.toBeNull();
  });
});

describe('home screen demo', () => {
  it('the hard-coded demo shot actually hits', () => {
    expect(run(L, 38, 16).success).toBe(true);
  });
});
