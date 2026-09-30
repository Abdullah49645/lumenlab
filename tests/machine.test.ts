import { describe, expect, it } from 'vitest';
import { moduleFor } from '../src/experiments';
import type { Prediction } from '../src/experiments/types';
import { initialState, reduce, type Action, type LabState } from '../src/experiment/machine';
import { getLesson } from '../src/lessons';
import { findSolution } from '../src/lessons/solve';

const play = (s: LabState, ...actions: Action[]) => actions.reduce(reduce, s);
const LID = 'projectile-earth';
const point = (x: number, y: number): Prediction => ({ kind: 'point', x, y });

function openLab() {
  return play(initialState(), { type: 'OPEN_LESSON', lessonId: LID }, { type: 'ENTER_LAB' });
}

describe('learning loop state machine', () => {
  it('requires a prediction before running', () => {
    const s = play(openLab(), { type: 'BEGIN_PREDICT' }, { type: 'RUN', timestamp: 0 });
    expect(s.phase).toBe('predict');
    expect(s.runs).toHaveLength(0);
  });

  it('ignores rapid repeated Run presses', () => {
    const s = play(
      openLab(),
      { type: 'BEGIN_PREDICT' },
      { type: 'SET_PREDICTION', prediction: point(10, 0) },
      { type: 'RUN', timestamp: 1 },
      { type: 'RUN', timestamp: 2 },
      { type: 'RUN', timestamp: 3 },
    );
    expect(s.phase).toBe('running');
    expect(s.runs).toHaveLength(1);
  });

  it('clamps and snaps parameters, and reset restores the initial setup', () => {
    let s = play(openLab(), { type: 'SET_PARAM', key: 'angleDeg', value: 999 }, { type: 'SET_PARAM', key: 'speed', value: 13.26 });
    expect(s.config).toEqual({ kind: 'projectile', angleDeg: 80, speed: 13.5 });
    s = reduce(s, { type: 'RESET_SETUP' });
    expect(s.config).toEqual({ kind: 'projectile', angleDeg: 30, speed: 12 });
  });

  it('a failed run goes result → reflect → build, keeping the reflection', () => {
    const s = play(
      openLab(),
      { type: 'BEGIN_PREDICT' },
      { type: 'SET_PREDICTION', prediction: point(20, 0) },
      { type: 'RUN', timestamp: 1 },
      { type: 'PLAYBACK_DONE' },
      { type: 'REFLECT' },
      { type: 'SUBMIT_REFLECTION', surprised: ' it fell short ', change: 'more speed' },
    );
    expect(s.phase).toBe('build');
    expect(s.runs[0].evaluation.success).toBe(false);
    expect(s.runs[0].reflection).toEqual({ surprised: 'it fell short', change: 'more speed' });
    expect(reduce(s, { type: 'REVEAL' })).toBe(s); // no reveal without a success
  });

  it('a successful run unlocks the reveal', () => {
    const sol = findSolution(getLesson(LID))!;
    const s = play(
      openLab(),
      { type: 'SET_PARAM', key: 'angleDeg', value: sol.angleDeg },
      { type: 'SET_PARAM', key: 'speed', value: sol.speed },
      { type: 'BEGIN_PREDICT' },
      { type: 'SET_PREDICTION', prediction: point(24, 5) },
      { type: 'RUN', timestamp: 1 },
      { type: 'PLAYBACK_DONE' },
      { type: 'REVEAL' },
    );
    expect(s.phase).toBe('reveal');
    expect(s.revealed).toBe(true);
  });

  it('replay reproduces the recorded outcome and returns to where it started', () => {
    let s = play(
      openLab(),
      { type: 'BEGIN_PREDICT' },
      { type: 'SET_PREDICTION', prediction: point(12, 0) },
      { type: 'RUN', timestamp: 1 },
      { type: 'PLAYBACK_DONE' },
      { type: 'REVISE' },
      { type: 'REPLAY', attempt: 1 },
    );
    expect(s.phase).toBe('running');
    expect(s.playing).toEqual({ attempt: 1, replay: true });
    const recorded = s.runs[0];
    const lesson = getLesson(LID);
    const mod = moduleFor(lesson);
    const again = mod.evaluate(lesson, mod.simulate(lesson, recorded.config), lesson.successConditions);
    expect(again).toEqual(recorded.evaluation);
    s = reduce(s, { type: 'PLAYBACK_DONE' });
    expect(s.phase).toBe('build');
  });

  it('transfer opens the Moon lesson carrying the winning config', () => {
    const s = reduce(initialState(), { type: 'OPEN_LESSON', lessonId: 'projectile-moon', config: { kind: 'projectile', angleDeg: 41, speed: 15.5 } });
    expect(s.phase).toBe('intro');
    expect(s.config).toEqual({ kind: 'projectile', angleDeg: 41, speed: 15.5 });
    expect(s.runs).toHaveLength(0);
  });
});

describe('the same loop drives every experiment', () => {
  it('bridge: prediction is required, then a run is recorded and evaluated', () => {
    let s = play(initialState(), { type: 'OPEN_LESSON', lessonId: 'bridge' }, { type: 'ENTER_LAB' });
    s = reduce(s, { type: 'SET_CONFIG', config: { kind: 'bridge', beams: [['0,0', '2,2']] } });
    expect(s.config).toEqual({ kind: 'bridge', beams: [['0,0', '2,2']] });
    s = play(s, { type: 'BEGIN_PREDICT' }, { type: 'RUN', timestamp: 1 });
    expect(s.phase).toBe('predict');
    s = play(s, { type: 'SET_PREDICTION', prediction: { kind: 'bridge', holds: true, memberId: 'B01' } }, { type: 'RUN', timestamp: 1 });
    expect(s.runs[0].prediction).toEqual({ kind: 'bridge', holds: true, memberId: null });
    expect(s.runs[0].evaluation.success).toBe(false);
    expect(s.runs[0].feedback.close).toBe(false);
  });

  it('gears: a transfer carries the gear train into the next lesson', () => {
    const config = { kind: 'gears' as const, gears: [{ x: 5, y: 4, size: 'small' as const }], outputSize: 'small' as const };
    const s = reduce(initialState(), { type: 'OPEN_LESSON', lessonId: 'gears-reverse', config });
    expect(s.config).toEqual(config);
  });

  it('a config of the wrong kind is replaced by the lesson default', () => {
    let s = play(initialState(), { type: 'OPEN_LESSON', lessonId: 'gears' }, { type: 'ENTER_LAB' });
    s = reduce(s, { type: 'SET_CONFIG', config: { kind: 'projectile', angleDeg: 10, speed: 10 } });
    expect(s.config.kind).toBe('gears');
  });
});
