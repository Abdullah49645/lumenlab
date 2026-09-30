/**
 * Success conditions are data, authored in each lesson. Every evaluator is a
 * pure function of (world, simulation result, conditions).
 */
export type SuccessCondition =
  | { type: 'target-hit'; targetId: string }
  | { type: 'survives-load' }
  | { type: 'output-rpm'; rpm: number; tolerance: number };

export interface Evaluation {
  success: boolean;
  /** Short machine-readable verdict, e.g. "hit", "short", "collapsed", "jammed". */
  verdict: string;
  headline: string;
  /** A few words for the attempt history, e.g. "Short by 3.42 m". */
  summary: string;
  details: string[];
  /** Numbers the evaluator measured, for tests and the notebook export. */
  measurements: Record<string, number | null>;
  /** Parts of the build to highlight on the canvas (beam ids, gear indices). */
  highlight: { members?: string[]; gears?: number[]; node?: string };
}
