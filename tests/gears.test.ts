import { describe, expect, it } from 'vitest';
import { analyzeGears, checkPlacement, type GearsConfig, type GearsWorld } from '../src/engine/gears';
import { gearsModule } from '../src/experiments/gears';
import { gearsLesson, gearsReverseLesson } from '../src/lessons/gears';

const world = gearsLesson.world as GearsWorld;
type G = GearsConfig['gears'][number];
const cfg = (outputSize: 'small' | 'large', ...gears: G[]): GearsConfig => ({ kind: 'gears', gears, outputSize });
const L = (x: number, y: number): G => ({ x, y, size: 'large' });
const M = (x: number, y: number): G => ({ x, y, size: 'medium' });
const S = (x: number, y: number): G => ({ x, y, size: 'small' });

// Found by a breadth-first search over placements; kept here as known answers.
export const solution120 = cfg('small', L(2, 0), S(5, 0), L(8, 0), L(12, 0), L(12, 4));
export const solutionMinus60 = cfg('large', L(2, 0), S(5, 0), S(7, 0), S(9, 0), M(11.5, 0), L(15, 0));

const evaluate = (lesson = gearsLesson, c: GearsConfig) =>
  gearsModule.evaluate(lesson, gearsModule.simulate(lesson, c), lesson.successConditions);

describe('gear engine', () => {
  it('a single mesh reverses direction and scales speed by the radius ratio', () => {
    const a = analyzeGears(world, cfg('large', S(5, 4)));
    expect(a.rpm[2]).toBeCloseTo(-120, 9); // large (r=2) at 60 → small (r=1) at −120
  });

  it('nothing reaches a disconnected output', () => {
    const a = analyzeGears(world, cfg('large', S(5, 4)));
    expect(a.connected).toBe(false);
    expect(a.outputRpm).toBeNull();
  });

  it('an odd loop of meshes jams the whole train', () => {
    // motor – S(5,4) – S(5,6) – S(5,8) – L(2,8) – motor: a closed loop of 5 meshes.
    const c = cfg('large', S(5, 4), S(5, 6), S(5, 8), L(2, 8));
    const a = analyzeGears(world, c);
    expect(a.meshes.length).toBe(5);
    expect(a.jammed).toBe(true);
    expect(a.jamLoop.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses overlapping gears and gears through the housing', () => {
    expect(checkPlacement(world, cfg('large'), 3, 4, 'small').ok).toBe(false);
    expect(checkPlacement(world, cfg('large'), 8, 4, 'small').ok).toBe(false);
    expect(checkPlacement(world, cfg('large'), 5, 4, 'small')).toEqual({ ok: true, meshesWith: ['Motor'] });
  });

  it('is deterministic', () => {
    expect(analyzeGears(world, solution120)).toEqual(analyzeGears(world, solution120));
  });
});

describe('gear challenge', () => {
  it('the main challenge is solvable', () => {
    expect(evaluate(gearsLesson, solution120).success).toBe(true);
  });

  it('the same train with a large output gear is too slow', () => {
    const ev = evaluate(gearsLesson, { ...solution120, outputSize: 'large' });
    expect(ev.success).toBe(false);
  });

  it('an idler changes direction but not speed', () => {
    const a = analyzeGears(world, solution120);
    const b = analyzeGears(world, cfg('small', L(2, 0), S(5, 0), S(7, 0), S(9, 0), L(12, 0), L(12, 4)));
    expect(Math.abs(a.outputRpm!)).toBeCloseTo(Math.abs(b.outputRpm!), 9);
    expect(Math.sign(a.outputRpm!)).toBe(-Math.sign(b.outputRpm!));
  });

  it('transfer: the Earth answer fails the reverse challenge, which is solvable', () => {
    expect(evaluate(gearsReverseLesson, solution120).success).toBe(false);
    expect(evaluate(gearsReverseLesson, solutionMinus60).success).toBe(true);
  });
});
