import type { ProjectileConfig } from '../experiments/types';
import { projectileModule } from '../experiments/projectile';
import type { LessonDefinition } from './schema';

/**
 * Brute-force every launcher setting the learner can reach and return the
 * ones that succeed. Used by tests to prove projectile lessons are solvable.
 * It is never shown to the learner.
 */
export function findSolutions(lesson: LessonDefinition): ProjectileConfig[] {
  const angle = lesson.tools!.find((t) => t.key === 'angleDeg')!;
  const speed = lesson.tools!.find((t) => t.key === 'speed')!;
  const out: ProjectileConfig[] = [];
  for (let a = angle.min; a <= angle.max + 1e-9; a += angle.step) {
    for (let v = speed.min; v <= speed.max + 1e-9; v += speed.step) {
      const config: ProjectileConfig = { kind: 'projectile', angleDeg: +a.toFixed(6), speed: +v.toFixed(6) };
      const result = projectileModule.simulate(lesson, config);
      if (projectileModule.evaluate(lesson, result, lesson.successConditions).success) out.push(config);
    }
  }
  return out;
}

export function findSolution(lesson: LessonDefinition): ProjectileConfig | null {
  const all = findSolutions(lesson);
  return all.length ? all[Math.floor(all.length / 2)] : null;
}
