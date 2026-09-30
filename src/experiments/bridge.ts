import {
  beamLength,
  isUsablePoint,
  materialUsed,
  parseKey,
  simulateBridge,
  type BridgeConfig,
  type BridgeResult,
  type BridgeWorld,
  type Stage,
} from '../engine/truss';
import { evaluateBridge } from '../evaluator/bridge';
import type { LessonDefinition } from '../lessons/schema';
import type { ExperimentModule } from './module';
import type { ExperimentConfig } from './types';

const world = (l: LessonDefinition) => l.world as BridgeWorld;
const cfg = (c: ExperimentConfig) => c as BridgeConfig;
const same = (a: [string, string], b: [string, string]) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

export type BeamEdit = { ok: true; config: BridgeConfig } | { ok: false; reason: string };

/** Add a beam between two joint points, or explain why not. */
export function addBeam(lesson: LessonDefinition, config: BridgeConfig, a: string, b: string): BeamEdit {
  const w = world(lesson);
  if (a === b) return { ok: false, reason: 'Pick a different second joint.' };
  if (!isUsablePoint(w, a) || !isUsablePoint(w, b)) return { ok: false, reason: 'Beams can only end on the joint points.' };
  const len = beamLength(a, b);
  if (len > w.maxBeamLength + 1e-9) return { ok: false, reason: `That beam would be ${len.toFixed(2)} m. The longest allowed is ${w.maxBeamLength} m.` };
  const isRoad = w.deck.some((k, i) => i + 1 < w.deck.length && same([k, w.deck[i + 1]], [a, b]));
  if (isRoad || config.beams.some((x) => same(x, [a, b]))) return { ok: false, reason: 'There is already a beam there.' };
  if (w.anchors.includes(a) && w.anchors.includes(b)) return { ok: false, reason: 'Both ends are fixed to rock, so that beam would do nothing.' };
  const used = materialUsed(config);
  if (used + len > w.budget + 1e-9) return { ok: false, reason: `Not enough steel: that needs ${len.toFixed(2)} m and ${(w.budget - used).toFixed(2)} m is left.` };
  return { ok: true, config: { kind: 'bridge', beams: [...config.beams, [a, b]] } };
}

export function removeBeam(config: BridgeConfig, index: number): BridgeConfig {
  return { kind: 'bridge', beams: config.beams.filter((_, i) => i !== index) };
}

/** Beam forces (kN, tension positive) at load fraction f. */
export function forcesAt(result: BridgeResult, f: number): Record<string, number> {
  let stage: Stage | undefined = result.analysis.stages[0];
  for (const s of result.analysis.stages) if (s.fromF <= f + 1e-12) stage = s;
  const out: Record<string, number> = {};
  if (!stage) return out;
  for (const [id, F] of Object.entries(stage.forces)) out[id] = F * f;
  return out;
}

const kN = (v: number) => `${v.toFixed(1)} kN`;

export const bridgeModule: ExperimentModule<BridgeResult> = {
  engine: 'bridge',
  defaultConfig: () => ({ kind: 'bridge', beams: [] }),
  sanitize(lesson, config) {
    if (config.kind !== 'bridge') return { kind: 'bridge', beams: [] };
    let clean: BridgeConfig = { kind: 'bridge', beams: [] };
    for (const [a, b] of config.beams) {
      const r = addBeam(lesson, clean, a, b);
      if (r.ok) clean = r.config;
    }
    return clean;
  },
  simulate: (lesson, config) => simulateBridge(world(lesson), cfg(config)),
  evaluate: (lesson, result, conditions) => evaluateBridge(world(lesson), result, conditions),
  emptyPrediction: () => ({ kind: 'bridge', holds: null, memberId: null }),
  sanitizePrediction: (_l, p) => (p.kind === 'bridge' ? { ...p, memberId: p.holds === false ? p.memberId : null } : { kind: 'bridge', holds: null, memberId: null }),
  predictionReady: (p) => p.kind === 'bridge' && p.holds !== null,
  predictionFeedback(_lesson, p, result) {
    if (p.kind !== 'bridge') return { close: false, text: '' };
    const held = result.analysis.events.length === 0 && !result.analysis.collapse;
    const first = result.analysis.events[0]?.memberId ?? null;
    if (p.holds === held) {
      if (!held && p.memberId) {
        return p.memberId === first
          ? { close: true, text: `You predicted it would fail, and that ${first} would go first. Both right.` }
          : { close: true, text: `You predicted it would fail, and it did. You picked ${p.memberId}; the first to break was ${first ?? 'none (the shape folded)'}.` };
      }
      return { close: true, text: held ? 'You predicted it would hold, and it did.' : 'You predicted it would fail, and it did.' };
    }
    return { close: false, text: held ? 'You predicted it would fail, but it held.' : 'You predicted it would hold. It didn’t.' };
  },
  duration: (r) => r.duration,
  measurements(lesson, _config, r) {
    const w = world(lesson);
    const stage = r.analysis.stages[0];
    if (!stage) return [];
    const byId = new Map(r.analysis.members.map((m) => [m.id, m]));
    const ranked = Object.entries(stage.forces)
      .map(([id, F]) => ({ id, F, ratio: Math.abs(F) / (F >= 0 ? w.member.tensionLimit : w.member.compressionLimit) }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 4);
    const rows: [string, string][] = ranked.map(({ id, F, ratio }) => [
      `Beam ${id}`,
      `${F >= 0 ? 'tension' : 'compression'} ${kN(Math.abs(F))}\n${Math.round(ratio * 100)}% of its ${F >= 0 ? w.member.tensionLimit : w.member.compressionLimit} kN limit`,
    ]);
    // Equilibrium at the truck's joint: beams pull up exactly as hard as the load pushes down.
    const n = w.vehicle.node;
    const [nx, ny] = parseKey(n);
    let up = 0;
    for (const m of r.analysis.members) {
      if (m.a !== n && m.b !== n) continue;
      const other = m.a === n ? m.b : m.a;
      const [ox, oy] = parseKey(other);
      up += (stage.forces[m.id] ?? 0) * ((oy - ny) / m.length);
      void ox;
      void nx;
      void byId;
    }
    const down = w.vehicle.force + w.deckLoad;
    rows.push(['Balance at the truck joint', `beams pull up ${kN(up)}\ntruck + road push down ${kN(down)}`]);
    if (r.analysis.sag !== null) rows.push(['Sag under the truck', `${(r.analysis.sag * 1000).toFixed(1)} mm (drawn ×${r.exaggeration})`]);
    return rows;
  },
  describe(lesson, config) {
    const w = world(lesson);
    const c = cfg(config);
    return `Bridge across a ${w.grid.maxX - w.grid.minX} metre gap with ${c.beams.length} added beams, using ${materialUsed(c).toFixed(1)} of ${w.budget} metres of steel. A ${w.vehicle.force} kilonewton truck will stop at the middle.`;
  },
};
