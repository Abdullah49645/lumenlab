import type { GearsWorld } from '../engine/gears';
import type { LessonDefinition } from './schema';

const gearsWorld: GearsWorld = {
  engine: 'gears',
  theme: 'lab',
  view: { minX: -2.4, minY: -2.6, width: 20.8, height: 13.4 },
  pegs: { minX: 0, maxX: 16, minY: 0, maxY: 8, step: 0.5 },
  radius: { small: 1, medium: 1.5, large: 2 },
  teeth: { small: 10, medium: 15, large: 20 },
  motor: { x: 2, y: 4, size: 'large', rpm: 60 },
  output: { x: 15, y: 4 },
  obstacles: [{ id: 'housing', label: 'housing', minX: 6, minY: 2, maxX: 10, maxY: 6 }],
  duration: 4,
};

const equations = [
  { label: 'One mesh', html: 'ω<sub>2</sub> = −ω<sub>1</sub> · <i>r</i><sub>1</sub> / <i>r</i><sub>2</sub>' },
  { label: 'A whole train with n meshes', html: 'ω<sub>out</sub> = (−1)<sup><i>n</i></sup> · ω<sub>in</sub> · <i>r</i><sub>in</sub> / <i>r</i><sub>out</sub>' },
];

export const gearsLesson: LessonDefinition = {
  id: 'gears',
  code: '03',
  title: 'Transfer the motion',
  domain: 'Mechanisms',
  difficulty: 'Intermediate',
  estMinutes: 7,
  concepts: ['Gear ratios', 'Direction of rotation', 'Idler gears', 'Constraints'],
  challenge: {
    prompt: 'Make the output turn clockwise at 120 rpm',
    brief: [
      'The motor turns clockwise at 60 rpm. The output shaft is on the far side of the housing.',
      'Put gears on the pegs to connect them. You also choose which gear goes on the output shaft.',
      'Gears only drive each other when their teeth touch.',
    ],
    constraints: ['Gears with 10, 15 or 20 teeth', 'Goal 120 rpm clockwise'],
  },
  world: gearsWorld,
  firstLead: 'Place your first gears. Try touching the motor and see what happens.',
  prediction: {
    prompt: 'What will the output shaft do?',
    help: 'Pick a direction, and whether it will be slower, the same or faster than the motor.',
  },
  successConditions: [{ type: 'output-rpm', rpm: 120, tolerance: 0.01 }],
  hints: [
    'Watch any two touching gears. Which way does each one turn?',
    'Count the meshes between the motor and the output. What changes if you add one more gear?',
    'A gear with half the teeth has to spin twice as fast to keep up. Look at the gear on the output shaft.',
  ],
  reflection: { prompts: ['What surprised you?', 'What will you change next?'] },
  reveal: {
    title: 'Gear trains',
    lead: 'Every mesh flips the direction. Only the first and last gears decide the speed.',
    discoveries: [
      { tone: 'cyan', label: 'Direction', text: 'Touching teeth move together, so meshing gears turn opposite ways. An even number of meshes brings you back to the motor’s direction.' },
      { tone: 'coral', label: 'Speed', text: 'The rims move at the same speed, so a gear with half the radius (half the teeth) turns twice as fast.' },
      { tone: 'lumen', label: 'Idlers', text: 'Gears in the middle cancel out: whatever one speeds up, the next slows down. They only change the direction and carry the motion further.' },
    ],
    equations,
    canvasNote: 'In the lab, each gear now shows its speed. Arrows show which way it turns.',
  },
  transfer: { lessonId: 'gears-reverse', label: 'Reverse the output' },
  modelNote:
    'Ideal rigid gears: no slipping, backlash, friction or inertia, and radius proportional to tooth count. Only the motion (direction and speed) is modelled, not the torque each gear carries.',
};

export const gearsReverseLesson: LessonDefinition = {
  ...gearsLesson,
  id: 'gears-reverse',
  code: '03T',
  title: 'Reverse the output',
  difficulty: 'Transfer',
  estMinutes: 3,
  challenge: {
    prompt: 'Now make it turn counter-clockwise at 60 rpm',
    brief: [
      'Your gear train came with you.',
      'This time the output has to turn the other way, at the same speed as the motor.',
      'Predict what your current train does before you change it.',
    ],
    constraints: ['Gears with 10, 15 or 20 teeth', 'Goal 60 rpm counter-clockwise'],
  },
  firstLead: 'Your gear train came with you. Predict first, then change as little as you can.',
  successConditions: [{ type: 'output-rpm', rpm: -60, tolerance: 0.01 }],
  hints: [
    'Two separate things have to change: the direction and the speed. Which part controls which?',
    'Direction depends on the number of meshes. Speed depends only on the motor gear and the output gear.',
    'Match the output gear to the motor gear, then add or remove one gear somewhere in the chain.',
  ],
  reveal: { ...gearsLesson.reveal, title: 'Direction and speed are separate', lead: 'You changed them independently: the count of meshes for direction, the end gears for speed.' },
  transfer: null,
};
