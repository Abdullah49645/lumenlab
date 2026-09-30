import type { LessonDefinition } from '../lessons/schema';
import { bridgeModule } from './bridge';
import { gearsModule } from './gears';
import type { ExperimentModule } from './module';
import { projectileModule } from './projectile';

const modules: Record<string, ExperimentModule<any>> = {
  projectile: projectileModule,
  bridge: bridgeModule,
  gears: gearsModule,
};

export function moduleFor(lesson: LessonDefinition): ExperimentModule<any> {
  return modules[lesson.world.engine];
}
