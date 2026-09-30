import type { Evaluation } from '../evaluator/types';
import { moduleFor } from '../experiments';
import type { ExperimentConfig, Prediction, PredictionFeedback } from '../experiments/types';
import { getLesson } from '../lessons';

/**
 * The learning loop as a pure state machine, shared by every experiment.
 *
 *   home → intro → build ⇄ predict → running → result → reflect → build (revise)
 *                                                    ↘ reveal → transfer (next lesson)
 *
 * reduce() never touches the DOM, timers or randomness. Invalid actions return
 * the same state object, which is how rapid double-clicks on Run are ignored.
 */
export type Phase = 'home' | 'intro' | 'build' | 'predict' | 'running' | 'result' | 'reflect' | 'reveal';

export interface Reflection {
  surprised: string;
  change: string;
}

/** One recorded experiment. Frames are not stored: replay re-simulates from config. */
export interface ExperimentRun {
  attempt: number;
  lessonId: string;
  config: ExperimentConfig;
  prediction: Prediction;
  evaluation: Evaluation;
  feedback: PredictionFeedback;
  reflection: Reflection | null;
  timestamp: number;
}

export interface LabState {
  phase: Phase;
  lessonId: string | null;
  config: ExperimentConfig;
  prediction: Prediction | null;
  runs: ExperimentRun[];
  playing: { attempt: number; replay: boolean } | null;
  returnPhase: Phase;
  hintLevel: number;
  revealed: boolean;
}

export type Action =
  | { type: 'HOME' }
  | { type: 'OPEN_LESSON'; lessonId: string; config?: ExperimentConfig }
  | { type: 'ENTER_LAB' }
  | { type: 'SET_PARAM'; key: 'angleDeg' | 'speed'; value: number }
  | { type: 'SET_CONFIG'; config: ExperimentConfig }
  | { type: 'RESET_SETUP' }
  | { type: 'BEGIN_PREDICT' }
  | { type: 'SET_PREDICTION'; prediction: Prediction }
  | { type: 'BACK_TO_BUILD' }
  | { type: 'RUN'; timestamp: number }
  | { type: 'REPLAY'; attempt: number }
  | { type: 'PLAYBACK_DONE' }
  | { type: 'REFLECT' }
  | { type: 'SUBMIT_REFLECTION'; surprised: string; change: string }
  | { type: 'REVISE' }
  | { type: 'REVEAL' }
  | { type: 'HINT' };

export function initialState(): LabState {
  return {
    phase: 'home',
    lessonId: null,
    config: { kind: 'projectile', angleDeg: 30, speed: 12 },
    prediction: null,
    runs: [],
    playing: null,
    returnPhase: 'build',
    hintLevel: 0,
    revealed: false,
  };
}

export function defaultConfig(lessonId: string): ExperimentConfig {
  const lesson = getLesson(lessonId);
  return moduleFor(lesson).defaultConfig(lesson);
}

export const lastRun = (s: LabState): ExperimentRun | null => s.runs[s.runs.length - 1] ?? null;
export const lastSuccess = (s: LabState): ExperimentRun | null =>
  [...s.runs].reverse().find((r) => r.evaluation.success) ?? null;

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function reduce(s: LabState, a: Action): LabState {
  switch (a.type) {
    case 'HOME':
      return s.phase === 'home' ? s : initialState();

    case 'OPEN_LESSON': {
      const lesson = getLesson(a.lessonId);
      const mod = moduleFor(lesson);
      const config = a.config ? mod.sanitize(lesson, a.config) : mod.defaultConfig(lesson);
      return { ...initialState(), phase: 'intro', lessonId: a.lessonId, config };
    }

    case 'ENTER_LAB':
      return s.phase === 'intro' ? { ...s, phase: 'build' } : s;

    case 'SET_PARAM': {
      if (s.phase !== 'build' || !s.lessonId || s.config.kind !== 'projectile') return s;
      return reduce(s, { type: 'SET_CONFIG', config: { ...s.config, [a.key]: a.value } });
    }

    case 'SET_CONFIG': {
      if (s.phase !== 'build' || !s.lessonId) return s;
      const lesson = getLesson(s.lessonId);
      const config = moduleFor(lesson).sanitize(lesson, a.config);
      return sameJSON(config, s.config) ? s : { ...s, config };
    }

    case 'RESET_SETUP':
      return s.phase === 'build' && s.lessonId ? { ...s, config: defaultConfig(s.lessonId) } : s;

    case 'BEGIN_PREDICT': {
      if (s.phase !== 'build' || !s.lessonId) return s;
      return { ...s, phase: 'predict', prediction: moduleFor(getLesson(s.lessonId)).emptyPrediction() };
    }

    case 'SET_PREDICTION': {
      if (s.phase !== 'predict' || !s.lessonId) return s;
      const lesson = getLesson(s.lessonId);
      const prediction = moduleFor(lesson).sanitizePrediction(lesson, a.prediction);
      return sameJSON(prediction, s.prediction) ? s : { ...s, prediction };
    }

    case 'BACK_TO_BUILD':
      return s.phase === 'predict' ? { ...s, phase: 'build' } : s;

    case 'RUN': {
      if (s.phase !== 'predict' || !s.prediction || !s.lessonId) return s;
      const lesson = getLesson(s.lessonId);
      const mod = moduleFor(lesson);
      if (!mod.predictionReady(s.prediction)) return s;
      const result = mod.simulate(lesson, s.config);
      const attempt = s.runs.length + 1;
      const run: ExperimentRun = {
        attempt,
        lessonId: lesson.id,
        config: s.config,
        prediction: s.prediction,
        evaluation: mod.evaluate(lesson, result, lesson.successConditions),
        feedback: mod.predictionFeedback(lesson, s.prediction, result),
        reflection: null,
        timestamp: a.timestamp,
      };
      return { ...s, phase: 'running', runs: [...s.runs, run], playing: { attempt, replay: false }, returnPhase: 'result' };
    }

    case 'REPLAY': {
      if (s.phase !== 'build' && s.phase !== 'result' && s.phase !== 'reveal') return s;
      if (!s.runs.some((r) => r.attempt === a.attempt)) return s;
      return { ...s, phase: 'running', playing: { attempt: a.attempt, replay: true }, returnPhase: s.phase };
    }

    case 'PLAYBACK_DONE':
      return s.phase === 'running' ? { ...s, phase: s.returnPhase, playing: null } : s;

    case 'REFLECT':
      return s.phase === 'result' ? { ...s, phase: 'reflect' } : s;

    case 'SUBMIT_REFLECTION': {
      if (s.phase !== 'reflect') return s;
      const last = lastRun(s);
      if (!last) return s;
      const reflection = { surprised: a.surprised.trim(), change: a.change.trim() };
      const runs = s.runs.map((r) => (r === last ? { ...r, reflection } : r));
      return last.evaluation.success ? { ...s, runs, phase: 'reveal', revealed: true } : { ...s, runs, phase: 'build' };
    }

    case 'REVISE':
      return s.phase === 'result' || s.phase === 'reflect' || s.phase === 'reveal' ? { ...s, phase: 'build' } : s;

    case 'REVEAL': {
      const allowed = s.phase === 'result' || s.phase === 'reflect' || s.phase === 'build';
      return allowed && lastSuccess(s) ? { ...s, phase: 'reveal', revealed: true } : s;
    }

    case 'HINT': {
      if (!s.lessonId) return s;
      const max = getLesson(s.lessonId).hints.length;
      return s.hintLevel >= max ? s : { ...s, hintLevel: s.hintLevel + 1 };
    }
  }
}
