import type { LaunchConfig, ProjectileWorld } from '../engine/types';
import type { BridgeConfig, BridgeWorld } from '../engine/truss';
import type { GearsConfig, GearsWorld } from '../engine/gears';

export type World = ProjectileWorld | BridgeWorld | GearsWorld;
export type EngineKind = World['engine'];

export interface ProjectileConfig extends LaunchConfig {
  kind: 'projectile';
}
export type ExperimentConfig = ProjectileConfig | BridgeConfig | GearsConfig;

export type Direction = 'cw' | 'ccw' | 'none';
export type SpeedGuess = 'slower' | 'same' | 'faster';

/** What the learner committed to before running. */
export type Prediction =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'bridge'; holds: boolean | null; memberId: string | null }
  | { kind: 'gears'; direction: Direction | null; speed: SpeedGuess | null };

export interface PredictionFeedback {
  close: boolean;
  text: string;
}
