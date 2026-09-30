import { describe, expect, it } from 'vitest';
import { solveLinear } from '../src/engine/linalg';
import { analyzeBridge, materialUsed, simulateBridge, type BridgeConfig, type BridgeWorld } from '../src/engine/truss';
import { addBeam, bridgeModule } from '../src/experiments/bridge';
import { bridgeLesson, bridgeOffsetLesson } from '../src/lessons/bridge';

const world = bridgeLesson.world as BridgeWorld;
const cfg = (...beams: [string, string][]): BridgeConfig => ({ kind: 'bridge', beams });

/** A truss hung below the road, anchored to the lower cliff anchors. 39 m of steel. */
export function underTruss(): BridgeConfig {
  const beams: [string, string][] = [];
  for (let x = 0; x < 12; x += 2) beams.push([`${x},-2`, `${x + 2},-2`]);
  for (let x = 2; x <= 10; x += 2) beams.push([`${x},0`, `${x},-2`]);
  for (let x = 0; x < 12; x += 2) beams.push([`${x},0`, `${x + 2},-2`]);
  return cfg(...beams);
}

/** A shallow 2 m Pratt truss above the road. Looks reasonable, isn't strong enough. */
export function shallowTruss(): BridgeConfig {
  const beams: [string, string][] = [];
  for (let x = 2; x <= 10; x += 2) beams.push([`${x},0`, `${x},2`]);
  for (let x = 2; x < 10; x += 2) beams.push([`${x},2`, `${x + 2},2`]);
  beams.push(['0,0', '2,2'], ['10,2', '12,0'], ['2,2', '4,0'], ['4,2', '6,0'], ['6,0', '8,2'], ['8,0', '10,2']);
  return cfg(...beams);
}

describe('linear solver', () => {
  it('solves a small system and reports singular ones', () => {
    const ok = solveLinear([[2, 1], [1, 3]], [3, 5]);
    expect(ok.ok && ok.x.map((v) => +v.toFixed(9))).toEqual([0.8, 1.4]);
    expect(solveLinear([[1, 2], [2, 4]], [1, 2]).ok).toBe(false);
  });
});

describe('truss analysis', () => {
  it('a road with no supports is a mechanism and folds before any beam breaks', () => {
    const a = analyzeBridge(world, cfg());
    expect(a.collapse).not.toBeNull();
    expect(a.collapse!.f).toBe(0);
    expect(a.events).toHaveLength(0);
  });

  it('a well-triangulated under-truss holds, within budget', () => {
    const c = underTruss();
    expect(materialUsed(c)).toBeLessThanOrEqual(world.budget);
    const a = analyzeBridge(world, c);
    expect(a.collapse).toBeNull();
    expect(a.events).toHaveLength(0);
    expect(a.maxUtilisation!.ratio).toBeLessThan(1);
    expect(a.sag!).toBeGreaterThan(0);
  });

  it('a shallow truss fails in compression first, then collapses', () => {
    const a = analyzeBridge(world, shallowTruss());
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.events[0].mode).toBe('compression');
    expect(a.events[0].f).toBeGreaterThan(0);
    expect(a.events[0].f).toBeLessThan(1);
    expect(a.collapse).not.toBeNull();
  });

  it('forces balance at the loaded joint (equilibrium)', () => {
    const r = simulateBridge(world, underTruss());
    const rows = bridgeModule.measurements(bridgeLesson, underTruss(), r);
    const balance = rows.find(([k]) => k.startsWith('Balance'))![1];
    const [up, down] = [...balance.matchAll(/([\d.]+) kN/g)].map((m) => Number(m[1]));
    expect(up).toBeCloseTo(down, 1);
  });

  it('is deterministic, including the collapse animation', () => {
    expect(simulateBridge(world, shallowTruss())).toEqual(simulateBridge(world, shallowTruss()));
  });

  it('a collapse actually drops the truck', () => {
    const r = simulateBridge(world, shallowTruss());
    const i = r.analysis.nodes.indexOf(world.vehicle.node);
    const last = r.frames[r.frames.length - 1];
    expect(last.pos[2 * i + 1]).toBeLessThan(-2);
  });

  it('the collapse animation stays finite and above the water', () => {
    const r = simulateBridge(world, shallowTruss());
    for (const f of r.frames) for (let i = 1; i < f.pos.length; i += 2) {
      expect(Number.isFinite(f.pos[i - 1]) && Number.isFinite(f.pos[i])).toBe(true);
      expect(f.pos[i]).toBeGreaterThanOrEqual(world.waterY - 1e-9);
    }
  });
});

describe('bridge editing rules', () => {
  it('rejects beams that are too long, duplicated, over budget or rock-to-rock', () => {
    const empty = cfg();
    expect(addBeam(bridgeLesson, empty, '0,0', '6,0').ok).toBe(false);
    expect(addBeam(bridgeLesson, empty, '0,0', '2,0').ok).toBe(false); // road already there
    expect(addBeam(bridgeLesson, empty, '0,0', '0,-2').ok).toBe(false); // both anchors
    expect(addBeam(bridgeLesson, empty, '0,0', '2,2').ok).toBe(true);
    const nearlyFull = cfg(...Array.from({ length: 10 }, (_, i) => [`${(i % 5) * 2 + 2},0`, `${(i % 5) * 2 + 2},${i < 5 ? 4 : -4}`] as [string, string]));
    expect(materialUsed(nearlyFull)).toBe(40);
    expect(addBeam(bridgeLesson, nearlyFull, '0,0', '2,4').ok).toBe(true);
    expect(addBeam(bridgeLesson, { ...nearlyFull, beams: [...nearlyFull.beams, ['0,0', '2,4']] }, '12,0', '10,4').ok).toBe(false);
  });

  it('sanitize drops invalid beams from a tampered config', () => {
    const s = bridgeModule.sanitize(bridgeLesson, cfg(['0,0', '12,0'], ['0,0', '2,2'], ['0,0', '2,2'])) as BridgeConfig;
    expect(s.beams).toEqual([['0,0', '2,2']]);
  });
});

describe('bridge transfer', () => {
  it('the under-truss still holds with the truck off centre', () => {
    const a = analyzeBridge(bridgeOffsetLesson.world as BridgeWorld, underTruss());
    expect(a.collapse).toBeNull();
    expect(a.events).toHaveLength(0);
  });
});
