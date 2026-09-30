/** World units are metres, seconds and kilograms. The y axis points up; y = 0 is the ground. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned box used for solid scenery such as the target tower. */
export interface AABB {
  id: string;
  label: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A circular hit zone. The ball scores when its centre enters the circle. */
export interface CircleTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface ProjectileWorld {
  engine: 'projectile';
  theme: 'lab' | 'moon';
  /** Downward gravitational acceleration, m/s². */
  gravity: number;
  /** The rectangle of the world the camera frames. */
  view: { minX: number; minY: number; width: number; height: number };
  /** Leaving these limits ends the run as "out of bounds". */
  bounds: { minX: number; maxX: number; maxY: number };
  /** Hard stop for a run, in simulated seconds. */
  maxTime: number;
  /** Pivot of the launcher barrel; the ball starts at the muzzle. */
  launcher: { x: number; y: number; barrelLength: number };
  ball: { radius: number };
  target: CircleTarget;
  obstacles: AABB[];
}

/** Everything the learner can change in the projectile experiment. */
export interface LaunchConfig {
  angleDeg: number;
  speed: number;
}
