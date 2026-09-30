import { parseKey, type BridgeResult, type BridgeWorld } from '../engine/truss';
import type { Evaluation, SuccessCondition } from './types';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const at = (node: string) => {
  const [x, y] = parseKey(node);
  return `(${x} m, ${y} m)`;
};
const verb = (mode: string) => (mode === 'tension' ? 'pulled' : 'pushed');

export function evaluateBridge(world: BridgeWorld, result: BridgeResult, conditions: SuccessCondition[]): Evaluation {
  const { events, collapse, maxUtilisation, sag } = result.analysis;
  const needsSurvive = conditions.some((c) => c.type === 'survives-load');
  const intact = events.length === 0 && !collapse;
  const success = needsSurvive && intact;
  const truck = `${world.vehicle.label} (${world.vehicle.force} kN)`;
  const details: string[] = [];
  const measurements: Record<string, number | null> = {
    failedAtLoad: events[0]?.f ?? collapse?.f ?? null,
    maxUtilisation: maxUtilisation?.ratio ?? null,
    sagMm: sag !== null ? sag * 1000 : null,
    brokenBeams: events.length,
  };

  if (success) {
    details.push(`It carried the ${truck} at full load.`);
    if (maxUtilisation) {
      details.push(`Most loaded beam: ${maxUtilisation.memberId}, ${verb(maxUtilisation.mode)} to ${pct(maxUtilisation.ratio)} of its limit.`);
    }
    if (sag !== null) details.push(`The road under the truck sagged ${(sag * 1000).toFixed(1)} mm.`);
    return {
      success,
      verdict: 'held',
      headline: 'Bridge held',
      summary: `Held, ${maxUtilisation ? pct(maxUtilisation.ratio) + ' max' : 'intact'}`,
      details,
      measurements,
      highlight: maxUtilisation ? { members: [maxUtilisation.memberId] } : {},
    };
  }

  if (collapse && events.length === 0) {
    details.push(`The joint at ${at(collapse.node)} isn’t locked in place, so the structure folds as soon as any weight is on it.`);
    details.push('No beam broke. The shape itself could move.');
    return {
      success: false,
      verdict: 'folded',
      headline: 'Observation',
      summary: 'Folded',
      details,
      measurements,
      highlight: { node: collapse.node },
    };
  }

  const first = events[0];
  details.push(`${first.memberId} was ${verb(first.mode)} past its limit at ${pct(first.f)} of the full load (${Math.abs(first.force).toFixed(1)} kN of ${first.mode}).`);
  if (events.length > 1) details.push(`Its load moved to other beams, and ${events.length - 1} more broke: ${events.slice(1).map((e) => e.memberId).join(', ')}.`);
  if (collapse) details.push(`Then the joint at ${at(collapse.node)} could move freely and the bridge collapsed.`);
  else details.push('The rest of the bridge still carried the truck, but it is damaged.');

  return {
    success: false,
    verdict: collapse ? 'collapsed' : 'damaged',
    headline: 'Observation',
    summary: collapse ? `${first.memberId} broke at ${pct(first.f)}` : `Held, ${events.length} beam${events.length > 1 ? 's' : ''} broke`,
    details,
    measurements,
    highlight: { members: events.map((e) => e.memberId), node: collapse?.node },
  };
}
