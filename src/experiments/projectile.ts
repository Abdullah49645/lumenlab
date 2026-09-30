import { simulateProjectile, type SimResult } from '../engine/projectile';
import type { ProjectileWorld } from '../engine/types';
import { evaluateProjectile, predictionError } from '../evaluator/projectile';
import type { LessonDefinition } from '../lessons/schema';
import type { ExperimentModule } from './module';
import type { ExperimentConfig, ProjectileConfig } from './types';

const world = (l: LessonDefinition) => l.world as ProjectileWorld;
const cfg = (c: ExperimentConfig) => c as ProjectileConfig;
const f2 = (v: number) => v.toFixed(2);

export function snapTool(lesson: LessonDefinition, key: 'angleDeg' | 'speed', value: number): number {
  const tool = lesson.tools?.find((t) => t.key === key);
  if (!tool) return 0;
  if (!Number.isFinite(value)) return tool.initial;
  const clamped = Math.min(tool.max, Math.max(tool.min, value));
  const n = Math.round((clamped - tool.min) / tool.step);
  return +(tool.min + n * tool.step).toFixed(6);
}

export const projectileModule: ExperimentModule<SimResult> = {
  engine: 'projectile',
  defaultConfig(lesson) {
    const c: ProjectileConfig = { kind: 'projectile', angleDeg: 0, speed: 0 };
    for (const t of lesson.tools ?? []) c[t.key] = t.initial;
    return c;
  },
  sanitize(lesson, config) {
    const c = config.kind === 'projectile' ? config : (this.defaultConfig(lesson) as ProjectileConfig);
    return { kind: 'projectile', angleDeg: snapTool(lesson, 'angleDeg', c.angleDeg), speed: snapTool(lesson, 'speed', c.speed) };
  },
  simulate: (lesson, config) => simulateProjectile(world(lesson), cfg(config)),
  evaluate: (lesson, result, conditions) => evaluateProjectile(world(lesson), result, conditions),
  emptyPrediction: () => ({ kind: 'point', x: NaN, y: NaN }),
  sanitizePrediction(lesson, p) {
    if (p.kind !== 'point' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { kind: 'point', x: NaN, y: NaN };
    const v = world(lesson).view;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      kind: 'point',
      x: r2(Math.min(v.minX + v.width, Math.max(0, p.x))),
      y: r2(Math.min(v.minY + v.height, Math.max(0, p.y))),
    };
  },
  predictionReady: (p) => p.kind === 'point' && Number.isFinite(p.x),
  predictionFeedback(_lesson, p, result) {
    if (p.kind !== 'point') return { close: false, text: '' };
    const d = predictionError(p, result.outcome);
    if (d < 1) return { close: true, text: `Your prediction was close: ${f2(d)} m from where the ball first touched something.` };
    if (result.outcome.kind === 'out-of-bounds') return { close: false, text: 'Your result differed from your prediction. The ball left the lab entirely.' };
    return { close: false, text: `Your result differed from your prediction by ${f2(d)} m.` };
  },
  duration: (r) => r.frames[r.frames.length - 1].t,
  measurements(lesson, config, r) {
    const c = cfg(config);
    const g = world(lesson).gravity;
    const i = r.initial;
    const o = r.outcome;
    const xPred = i.x + i.vx * o.t;
    const yPred = i.y + i.vy * o.t - 0.5 * g * o.t * o.t;
    const rows: [string, string][] = [
      ['Launch split', `vx = ${c.speed} × cos ${c.angleDeg}° = ${f2(i.vx)} m/s\nvy = ${c.speed} × sin ${c.angleDeg}° = ${f2(i.vy)} m/s`],
      ['Time to the target', `${f2(o.t)} s`],
      ['Horizontal equation', `${f2(i.x)} + ${f2(i.vx)} × ${f2(o.t)} = ${f2(xPred)} m\nsimulated: ${f2(o.x)} m`],
      ['Vertical equation', `${f2(i.y)} + ${f2(i.vy)} × ${f2(o.t)} − ½ × ${g} × ${f2(o.t)}² = ${f2(yPred)} m\nsimulated: ${f2(o.y)} m`],
    ];
    if (r.apex) rows.push(['Highest point', `${f2(r.apex.y)} m at t = ${f2(r.apex.t)} s, where vy = 0`]);
    return rows;
  },
  describe(lesson, config) {
    const c = cfg(config);
    const w = world(lesson);
    return `Launcher set to ${c.angleDeg} degrees at ${c.speed} metres per second. Target centre ${w.target.x - w.launcher.x} metres away and ${w.target.y} metres high, on a tower.`;
  },
};
