import { bridgeLesson, bridgeOffsetLesson } from './bridge';
import { gearsLesson, gearsReverseLesson } from './gears';
import { moonLesson, projectileLesson } from './projectile';
import type { LessonDefinition } from './schema';

export const lessons: LessonDefinition[] = [projectileLesson, moonLesson, bridgeLesson, bridgeOffsetLesson, gearsLesson, gearsReverseLesson];

/** Entry points on the home screen. Transfer lessons are reached from a reveal. */
export const homeLessons: LessonDefinition[] = [projectileLesson, bridgeLesson, gearsLesson];

export function getLesson(id: string): LessonDefinition {
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) throw new Error(`Unknown lesson: ${id}`);
  return lesson;
}
