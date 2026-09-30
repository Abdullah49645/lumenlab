import { checkPlacement, simulateGears, type GearSize, type GearsConfig, type GearsResult, type GearsWorld } from '../engine/gears';
import { describeRpm, evaluateGears } from '../evaluator/gears';
import type { LessonDefinition } from '../lessons/schema';
import type { ExperimentModule } from './module';
import type { ExperimentConfig } from './types';

const world = (l: LessonDefinition) => l.world as GearsWorld;
const cfg = (c: ExperimentConfig) => c as GearsConfig;

export type GearEdit = { ok: true; config: GearsConfig; meshesWith: string[] } | { ok: false; reason: string };

export function placeGear(lesson: LessonDefinition, config: GearsConfig, x: number, y: number, size: GearSize): GearEdit {
  const p = checkPlacement(world(lesson), config, x, y, size);
  if (!p.ok) return p;
  return { ok: true, config: { ...config, gears: [...config.gears, { x, y, size }] }, meshesWith: p.meshesWith };
}

export const gearsModule: ExperimentModule<GearsResult> = {
  engine: 'gears',
  defaultConfig: () => ({ kind: 'gears', gears: [], outputSize: 'large' }),
  sanitize(lesson, config) {
    if (config.kind !== 'gears') return this.defaultConfig(lesson);
    const outputSize: GearSize = config.outputSize === 'small' ? 'small' : 'large';
    let clean: GearsConfig = { kind: 'gears', gears: [], outputSize };
    for (const g of config.gears) {
      const r = placeGear(lesson, clean, g.x, g.y, g.size);
      if (r.ok) clean = r.config;
    }
    return clean;
  },
  simulate: (lesson, config) => simulateGears(world(lesson), cfg(config)),
  evaluate: (lesson, result, conditions) => evaluateGears(world(lesson), result, conditions),
  emptyPrediction: () => ({ kind: 'gears', direction: null, speed: null }),
  sanitizePrediction: (_l, p) =>
    p.kind === 'gears' ? { ...p, speed: p.direction === 'none' ? null : p.speed } : { kind: 'gears', direction: null, speed: null },
  predictionReady: (p) => p.kind === 'gears' && p.direction !== null && (p.direction === 'none' || p.speed !== null),
  predictionFeedback(lesson, p, result) {
    if (p.kind !== 'gears') return { close: false, text: '' };
    const motor = world(lesson).motor.rpm;
    const out = result.analysis.jammed ? 0 : (result.analysis.outputRpm ?? 0);
    const dir = out === 0 ? 'none' : out > 0 ? 'cw' : 'ccw';
    const ratio = Math.abs(out) / Math.abs(motor);
    const speed = ratio > 1 + 1e-9 ? 'faster' : ratio < 1 - 1e-9 ? 'slower' : 'same';
    const dirOk = p.direction === dir;
    const speedOk = dir === 'none' || p.speed === speed;
    const actual = out === 0 ? 'The output didn’t turn.' : `The output ${describeRpm(out)}, ${speed === 'same' ? 'the same speed as' : `${speed} than`} the motor.`;
    if (dirOk && speedOk) return { close: true, text: `Your prediction matched. ${actual}` };
    if (dirOk) return { close: false, text: `You got the direction right, not the speed. ${actual}` };
    return { close: false, text: `Your result differed from your prediction. ${actual}` };
  },
  duration: (r) => r.duration,
  measurements(lesson, _config, r) {
    const a = r.analysis;
    const w = world(lesson);
    const rows: [string, string][] = a.path.map((i, k) => {
      const g = a.gears[i];
      const rpm = a.rpm[i] ?? 0;
      return [k === 0 ? `${g.id} (${g.teeth} teeth)` : `${g.id} (${g.teeth} teeth)`, `${rpm > 0 ? 'clockwise' : 'counter-clockwise'} ${Math.abs(rpm).toFixed(0)} rpm`];
    });
    const n = a.path.length - 1;
    const rIn = a.gears[0].r;
    const rOut = a.gears[1].r;
    const predicted = (n % 2 === 0 ? 1 : -1) * w.motor.rpm * (rIn / rOut);
    rows.push([
      'Formula check',
      `(−1)^${n} × ${w.motor.rpm} × ${a.gears[0].teeth}/${a.gears[1].teeth} = ${predicted.toFixed(0)} rpm\nsimulated: ${(a.outputRpm ?? 0).toFixed(0)} rpm`,
    ]);
    return rows;
  },
  describe(lesson, config) {
    const c = cfg(config);
    const w = world(lesson);
    return `Motor gear turning clockwise at ${w.motor.rpm} rpm on the left, output shaft with a ${c.outputSize} gear on the right, housing in between. ${c.gears.length} gears placed.`;
  },
};
