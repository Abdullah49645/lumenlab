import type { ProjectileWorld, Vec2 } from '../engine/types';
import { stateAtX, type Outcome, type SimResult } from '../engine/projectile';

import type { Evaluation, SuccessCondition } from './types';

export type Verdict = 'hit' | 'over' | 'short' | 'blocked' | 'lost';

const m = (v: number) => `${v.toFixed(2)} m`;

export function checkCondition(c: SuccessCondition, result: SimResult): boolean {
  if (c.type !== 'target-hit') return false;
  return result.outcome.kind === 'target' && result.outcome.colliderId === c.targetId;
}

export function evaluateProjectile(
  world: ProjectileWorld,
  result: SimResult,
  conditions: SuccessCondition[],
): Evaluation {
  const { outcome, initial } = result;
  const target = world.target;
  const success = conditions.length > 0 && conditions.every((c) => checkCondition(c, result));

  const crossing = stateAtX(initial, world.gravity, target.x);
  const crossingOffset = crossing ? crossing.y - target.y : null;
  const reachedLine = crossing !== null && crossing.t <= outcome.t + 1e-9;
  const flight = `Flight time ${outcome.t.toFixed(2)} s.`;
  const details: string[] = [];

  if (success) {
    details.push('The ball entered the target zone.');
    if (crossingOffset !== null) {
      details.push(
        `Its path was heading ${m(Math.abs(crossingOffset))} ${crossingOffset >= 0 ? 'above' : 'below'} the target's centre.`,
      );
    }
    details.push(flight);
    return {
      success,
      verdict: 'hit',
      headline: 'Target hit',
      summary: 'Hit',
      details,
      measurements: { crossingOffset, shortBy: null, flightTime: outcome.t },
      highlight: {},
    };
  }

  let verdict: Verdict;
  let summary: string;
  let shortBy: number | null = null;

  if (outcome.kind === 'obstacle') {
    const label = world.obstacles.find((o) => o.id === outcome.colliderId)?.label ?? 'obstacle';
    verdict = 'blocked';
    summary = `Hit the ${label}`;
    details.push(
      `The ball struck the ${label} at a height of ${m(outcome.y)}, ${m(target.y - outcome.y)} below the target's centre.`,
    );
  } else if (reachedLine && crossingOffset !== null) {
    verdict = crossingOffset > 0 ? 'over' : 'short';
    summary = crossingOffset > 0 ? `Over by ${m(crossingOffset)}` : `Under by ${m(-crossingOffset)}`;
    details.push(
      `It crossed the target line ${m(Math.abs(crossingOffset))} ${crossingOffset > 0 ? 'above' : 'below'} the target's centre.`,
    );
    if (outcome.kind === 'ground') details.push(`It came down at x = ${m(outcome.x)}.`);
    if (outcome.kind === 'out-of-bounds') details.push('Then it flew out of the lab.');
  } else if (outcome.kind === 'ground') {
    shortBy = target.x - outcome.x;
    verdict = 'short';
    summary = `Short by ${m(shortBy)}`;
    details.push(`It landed at x = ${m(outcome.x)}, ${m(shortBy)} short of the target line.`);
  } else {
    verdict = 'lost';
    summary = 'Left the lab';
    details.push('The ball left the lab before reaching the target line.');
  }
  details.push(flight);

  return {
    success: false,
    verdict,
    headline: 'Observation',
    summary,
    details,
    measurements: { crossingOffset, shortBy, flightTime: outcome.t },
    highlight: {},
  };
}

/** Distance between the learner's predicted point and where the ball first touched something. */
export function predictionError(prediction: Vec2, outcome: Outcome): number {
  return Math.hypot(prediction.x - outcome.x, prediction.y - outcome.y);
}
