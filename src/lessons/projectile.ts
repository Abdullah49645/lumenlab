import type { LessonDefinition } from './schema';
import type { ProjectileWorld } from '../engine/types';

const earthWorld: ProjectileWorld = {
  engine: 'projectile',
  theme: 'lab',
  gravity: 9.81,
  view: { minX: 0, minY: -1.6, width: 30, height: 14.6 },
  bounds: { minX: -5, maxX: 34, maxY: 60 },
  maxTime: 12,
  launcher: { x: 2, y: 1.2, barrelLength: 0.9 },
  ball: { radius: 0.15 },
  target: { id: 'target', x: 24, y: 5, radius: 0.7 },
  obstacles: [{ id: 'tower', label: 'tower', minX: 23.5, minY: 0, maxX: 24.5, maxY: 4.3 }],
};

const equations = [
  { label: 'Split the launch velocity', html: '<i>v</i><sub>x</sub> = <i>v</i> cos θ &nbsp;&nbsp; <i>v</i><sub>y</sub> = <i>v</i> sin θ' },
  { label: 'Horizontal', html: '<i>x</i>(<i>t</i>) = <i>x</i><sub>0</sub> + <i>v</i><sub>x</sub><i>t</i>' },
  { label: 'Vertical', html: '<i>y</i>(<i>t</i>) = <i>y</i><sub>0</sub> + <i>v</i><sub>y</sub><i>t</i> − ½<i>g</i><i>t</i><sup>2</sup>' },
];

export const projectileLesson: LessonDefinition = {
  id: 'projectile-earth',
  code: '01',
  title: 'Hit the target',
  domain: 'Motion',
  difficulty: 'Introductory',
  estMinutes: 6,
  concepts: ['Projectile motion', 'Independent components of motion', 'Gravity', 'Launch angle'],
  challenge: {
    prompt: 'Make the ball hit the target',
    brief: [
      'You have one launcher. The target won’t move.',
      'You can change the launch angle and the launch speed.',
      'You don’t need the formula yet.',
    ],
    constraints: ['Angle 10° to 80°', 'Speed 8 to 20 m/s'],
  },
  world: earthWorld,
  tools: [
    { key: 'angleDeg', label: 'Launch angle', unit: '°', min: 10, max: 80, step: 1, initial: 30 },
    { key: 'speed', label: 'Launch speed', unit: 'm/s', min: 8, max: 20, step: 0.5, initial: 12 },
  ],
  firstLead: 'Set up your first attempt.',
  prediction: {
    prompt: 'Where will the ball first touch something?',
    help: 'Click or drag in the lab to place your marker.',
  },
  successConditions: [{ type: 'target-hit', targetId: 'target' }],
  hints: [
    'Look at your attempts along the bottom. Did the ball fall short, or go over?',
    'What decides how long the ball stays in the air? And what does it do sideways during that time?',
    'Change one thing at a time. Keep the angle and change the speed, then try it the other way round.',
  ],
  reflection: { prompts: ['What surprised you?', 'What will you change next?'] },
  reveal: {
    title: 'Projectile motion',
    lead: 'The ball’s flight is two independent motions happening at once.',
    discoveries: [
      {
        tone: 'cyan',
        label: 'Sideways',
        text: 'Nothing pushes the ball sideways once it leaves the barrel, so its horizontal speed never changes. Equal times, equal distances.',
      },
      {
        tone: 'coral',
        label: 'Up and down',
        text: 'Gravity only acts vertically. It changes the vertical speed by the same amount every second: up, slowing, stopping, then falling faster.',
      },
      {
        tone: 'lumen',
        label: 'Together',
        text: 'Angle and speed decide how the launch is split between the two. Time in the air is what connects them.',
      },
    ],
    equations,
    canvasNote: 'In the lab, the dots mark the ball every 0.2 s. Watch the gaps between them sideways, and the arrows.',
  },
  transfer: { lessonId: 'projectile-moon', label: 'Try it on the Moon' },
  modelNote:
    'The ball is a point mass in uniform gravity (9.81 m/s²) with no air resistance and no spin. Any contact ends the flight; there is no bounce. The model shows the structure of projectile motion, not the exact flight of a real ball.',
};

const moonWorld: ProjectileWorld = {
  ...earthWorld,
  theme: 'moon',
  gravity: 1.62,
  bounds: { minX: -5, maxX: 34, maxY: 400 },
  maxTime: 40,
};

export const moonLesson: LessonDefinition = {
  ...projectileLesson,
  id: 'projectile-moon',
  code: '01T',
  title: 'Hit the target on the Moon',
  difficulty: 'Transfer',
  estMinutes: 3,
  challenge: {
    prompt: 'Same launcher, same target, different world',
    brief: [
      'The lab is now on the Moon, where gravity is about a sixth as strong (1.62 m/s²).',
      'Your winning angle and speed came with you.',
      'Before you touch anything, predict where the ball goes now.',
    ],
    constraints: ['Angle 10° to 80°', 'Speed 4 to 20 m/s'],
  },
  world: moonWorld,
  firstLead: 'Your Earth settings came with you. Predict what happens before changing anything.',
  tools: [
    { key: 'angleDeg', label: 'Launch angle', unit: '°', min: 10, max: 80, step: 1, initial: 30 },
    { key: 'speed', label: 'Launch speed', unit: 'm/s', min: 4, max: 20, step: 0.5, initial: 12 },
  ],
  hints: [
    'Did the ball go too far, or not far enough?',
    'Gravity is weaker here. What does that do to the time the ball spends in the air?',
    'More time in the air at the same horizontal speed means more distance. Try a much lower speed.',
  ],
  reveal: {
    title: 'Same laws, different g',
    lead: 'Nothing about the sideways motion changed. Gravity only ever acted vertically.',
    discoveries: [
      {
        tone: 'cyan',
        label: 'Sideways',
        text: 'Horizontal speed depends only on your launch. With the same settings it is identical to Earth.',
      },
      {
        tone: 'coral',
        label: 'Up and down',
        text: 'With g six times smaller, vertical speed drains away six times more slowly, so the ball stays up far longer.',
      },
      {
        tone: 'lumen',
        label: 'Together',
        text: 'Longer flight at the same horizontal speed means a longer path. That is why your Earth setting overshoots.',
      },
    ],
    equations,
    canvasNote: 'In the lab, the dots mark the ball every 0.2 s. On the Moon they spread much further apart.',
  },
  transfer: null,
  modelNote:
    'Same model as the Earth lab with g = 1.62 m/s². There is no air on the Moon, so for once “no air resistance” is close to the truth.',
};
