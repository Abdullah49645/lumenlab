import type { Evaluation, SuccessCondition } from '../evaluator/types';
import type { LessonDefinition } from '../lessons/schema';
import type { EngineKind, ExperimentConfig, Prediction, PredictionFeedback } from './types';

/**
 * Everything the shared learning loop needs to know about one kind of
 * experiment. The state machine, replay, notebook and result/reveal screens
 * only ever talk to this interface.
 */
export interface ExperimentModule<R = unknown> {
  engine: EngineKind;
  defaultConfig(lesson: LessonDefinition): ExperimentConfig;
  /** Clamp/repair a config so every stored config is valid and reproducible. */
  sanitize(lesson: LessonDefinition, config: ExperimentConfig): ExperimentConfig;
  simulate(lesson: LessonDefinition, config: ExperimentConfig): R;
  evaluate(lesson: LessonDefinition, result: R, conditions: SuccessCondition[]): Evaluation;
  emptyPrediction(): Prediction;
  sanitizePrediction(lesson: LessonDefinition, p: Prediction): Prediction;
  predictionReady(p: Prediction): boolean;
  predictionFeedback(lesson: LessonDefinition, p: Prediction, result: R): PredictionFeedback;
  /** Seconds of playback for a run. */
  duration(result: R): number;
  /** Rows for "Checked against your run" on the reveal screen. */
  measurements(lesson: LessonDefinition, config: ExperimentConfig, result: R): [string, string][];
  /** One-line description of a setup, for the panel and screen readers. */
  describe(lesson: LessonDefinition, config: ExperimentConfig): string;
}
