import type { GearsResult, GearsWorld } from '../engine/gears';
import type { Evaluation, SuccessCondition } from './types';

export const describeRpm = (rpm: number) =>
  rpm === 0 ? 'does not turn' : `turns ${rpm > 0 ? 'clockwise' : 'counter-clockwise'} at ${Math.abs(rpm).toFixed(0)} rpm`;

export function evaluateGears(world: GearsWorld, result: GearsResult, conditions: SuccessCondition[]): Evaluation {
  const a = result.analysis;
  const cond = conditions.find((c) => c.type === 'output-rpm');
  const out = a.outputRpm;
  const measurements: Record<string, number | null> = { outputRpm: out, meshes: a.path.length ? a.path.length - 1 : null };
  const target = cond && cond.type === 'output-rpm' ? cond : null;
  const success = !!target && out !== null && !a.jammed && Math.abs(out - target.rpm) <= target.tolerance;
  const details: string[] = [];

  if (a.jammed) {
    const names = a.jamLoop.map((i) => a.gears[i].id).join(', ');
    details.push(`${names} form a closed loop with an odd number of meshes. Each gear would have to turn both ways at once, so the whole train locks.`);
    return { success: false, verdict: 'jammed', headline: 'Observation', summary: 'Locked up', details, measurements, highlight: { gears: a.jamLoop } };
  }
  if (!a.connected) {
    const driven = a.rpm.filter((r) => r !== null).length - 1;
    details.push('No chain of touching gears reaches the output shaft, so no motion gets there.');
    details.push(driven > 0 ? `The motor is turning ${driven} gear${driven > 1 ? 's' : ''}, but the chain stops short.` : 'Nothing is touching the motor gear.');
    return { success: false, verdict: 'disconnected', headline: 'Observation', summary: 'Output not reached', details, measurements, highlight: {} };
  }

  const meshes = a.path.length - 1;
  details.push(`The output ${describeRpm(out!)}.`);
  details.push(`Motion passes through ${meshes} mesh${meshes === 1 ? '' : 'es'} on the way.`);
  if (success) {
    return { success, verdict: 'matched', headline: 'Motion transferred', summary: `${Math.abs(out!)} rpm ${out! > 0 ? 'cw' : 'ccw'}`, details, measurements, highlight: { gears: a.path } };
  }
  const wrongDir = target && Math.sign(out!) !== Math.sign(target.rpm);
  const wrongSpeed = target && Math.abs(Math.abs(out!) - Math.abs(target.rpm)) > target.tolerance;
  if (target) {
    details.push(`The goal was ${describeRpm(target.rpm).replace('turns ', '')}.`);
  }
  return {
    success: false,
    verdict: wrongDir && wrongSpeed ? 'wrong-both' : wrongDir ? 'wrong-direction' : 'wrong-speed',
    headline: 'Observation',
    summary: `${Math.abs(out!)} rpm ${out! > 0 ? 'cw' : 'ccw'}`,
    details,
    measurements,
    highlight: { gears: a.path },
  };
}
