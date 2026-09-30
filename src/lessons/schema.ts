import type { LaunchConfig } from '../engine/types';
import type { SuccessCondition } from '../evaluator/types';
import type { World } from '../experiments/types';

/**
 * A lesson is data. The engines, evaluators, state machine and UI are shared;
 * adding an experiment means writing one of these (plus an engine for a new
 * kind of world), not a new screen.
 */
export interface ToolDefinition {
  key: keyof LaunchConfig;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  initial: number;
}

/** Tones match the canvas: cyan and coral are the two components or force kinds, lumen is the combination. */
export type Tone = 'cyan' | 'coral' | 'lumen';

export interface RevealDefinition {
  title: string;
  lead: string;
  discoveries: { label: string; text: string; tone: Tone }[];
  /** Authored HTML (only <sub>, <sup>, <i>) so subscripts render properly. */
  equations: { label: string; html: string }[];
  /** What the overlay on the canvas is showing during the reveal. */
  canvasNote: string;
}

export interface LessonDefinition {
  id: string;
  code: string;
  title: string;
  domain: string;
  difficulty: string;
  estMinutes: number;
  concepts: string[];
  challenge: {
    prompt: string;
    brief: string[];
    constraints: string[];
  };
  world: World;
  /** Slider tools (projectile experiments). */
  tools?: ToolDefinition[];
  /** Shown above the build controls before the first run. */
  firstLead: string;
  prediction: { prompt: string; help: string };
  successConditions: SuccessCondition[];
  /** Escalating, authored, deterministic. Shown one at a time on request. */
  hints: string[];
  reflection: { prompts: [string, string] };
  reveal: RevealDefinition;
  transfer: { lessonId: string; label: string } | null;
  modelNote: string;
}
