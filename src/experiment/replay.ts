import { moduleFor } from '../experiments';
import type { ExperimentConfig } from '../experiments/types';
import { getLesson } from '../lessons';

/**
 * Replay is re-simulation. A run is stored as (lesson, config); because every
 * engine is deterministic, simulating it again reproduces every frame.
 * The cache only saves CPU; it never changes the result.
 */
const cache = new Map<string, unknown>();

export function simulateFor<R = any>(lessonId: string, config: ExperimentConfig): R {
  const key = `${lessonId}|${JSON.stringify(config)}`;
  if (!cache.has(key)) {
    const lesson = getLesson(lessonId);
    cache.set(key, moduleFor(lesson).simulate(lesson, config));
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return cache.get(key) as R;
}
