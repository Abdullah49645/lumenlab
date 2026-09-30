import type { BridgeWorld } from '../engine/truss';
import type { LessonDefinition } from './schema';

const deck = ['0,0', '2,0', '4,0', '6,0', '8,0', '10,0', '12,0'];

const bridgeWorld: BridgeWorld = {
  engine: 'bridge',
  theme: 'lab',
  view: { minX: -3, minY: -7.2, width: 18, height: 12.2 },
  grid: { minX: 0, maxX: 12, minY: -4, maxY: 4, step: 2 },
  anchors: ['0,0', '12,0', '0,-2', '12,-2', '0,-4', '12,-4'],
  deck,
  maxBeamLength: 4.5,
  budget: 48,
  member: { EA: 400000, tensionLimit: 70, compressionLimit: 55 },
  vehicle: { node: '6,0', force: 40, label: 'truck' },
  deckLoad: 4,
  waterY: -6.4,
};

const equations = [
  { label: 'At every joint, the forces balance', html: 'Σ<i>F</i><sub>x</sub> = 0 &nbsp;&nbsp; Σ<i>F</i><sub>y</sub> = 0' },
  { label: 'A beam’s force comes from how much it stretches', html: '<i>F</i> = (<i>EA</i> / <i>L</i>) · Δ<i>L</i>' },
  { label: 'Deeper structures, smaller forces', html: '<i>F</i><sub>chord</sub> ≈ <i>M</i> / <i>h</i> = <i>P L</i> / 4<i>h</i>' },
];

export const bridgeLesson: LessonDefinition = {
  id: 'bridge',
  code: '02',
  title: 'Survive the load',
  domain: 'Structures',
  difficulty: 'Intermediate',
  estMinutes: 8,
  concepts: ['Tension and compression', 'Load paths', 'Why triangles are rigid', 'Structural depth'],
  challenge: {
    prompt: 'Build a bridge that holds the truck',
    brief: [
      'The road is laid across the gap, but nothing holds it up yet.',
      'Add steel beams between the joint points. The cliffs have anchors at road level and below.',
      'A beam snaps if it is pulled or pushed too hard.',
    ],
    constraints: ['48 m of steel', 'Beams up to 4.5 m', 'Truck 40 kN'],
  },
  world: bridgeWorld,
  firstLead: 'Start building. The road on its own won’t hold anything.',
  prediction: {
    prompt: 'Will your bridge hold the truck?',
    help: 'If you think it fails, click the beam you think breaks first. That part is optional.',
  },
  successConditions: [{ type: 'survives-load' }],
  hints: [
    'Look at the last run. Did one beam break first, or did the whole shape fold without anything breaking?',
    'Push on the corner of a square and it leans over. A triangle can’t change shape unless one of its sides changes length.',
    'The same weight makes smaller forces in a deeper structure. There are anchors below the road on both cliffs too.',
  ],
  reflection: { prompts: ['What surprised you?', 'What will you change next?'] },
  reveal: {
    title: 'Load paths',
    lead: 'The truck’s weight travels through the beams to the cliffs. Every beam is either being pulled or pushed.',
    discoveries: [
      { tone: 'cyan', label: 'Pulled', text: 'Beams in tension are being stretched. Steel is strong this way: 70 kN before it snaps.' },
      { tone: 'coral', label: 'Pushed', text: 'Beams in compression are being squashed. They buckle sooner, at 55 kN, so pushed beams usually fail first.' },
      { tone: 'lumen', label: 'Triangles', text: 'A triangle can’t change shape without a beam changing length, so it resists load. A square can fold with every beam intact.' },
    ],
    equations,
    canvasNote: 'In the lab, cyan beams are pulled and coral beams are pushed. Thicker means more force.',
  },
  transfer: { lessonId: 'bridge-offset', label: 'Move the truck' },
  modelNote:
    'A pin-jointed truss: joints are hinges and beams only push or pull. Limits are 70 kN in tension and 55 kN in compression. The road weighs 4 kN per joint and the beams are weightless. Forces come from a linear static analysis. The collapse animation is simplified rigid-body motion, shown to illustrate what the analysis found, not to predict it.',
};

export const bridgeOffsetLesson: LessonDefinition = {
  ...bridgeLesson,
  id: 'bridge-offset',
  code: '02T',
  title: 'Survive the load, off centre',
  difficulty: 'Transfer',
  estMinutes: 4,
  challenge: {
    prompt: 'Same bridge, the truck stops somewhere else',
    brief: [
      'Your bridge came with you. This time the truck stops 4 m from the left cliff instead of in the middle.',
      'The weight is the same. Only where it sits has changed.',
      'Before you change anything, predict whether it still holds.',
    ],
    constraints: ['48 m of steel', 'Beams up to 4.5 m', 'Truck 40 kN at 4 m'],
  },
  world: { ...bridgeWorld, vehicle: { ...bridgeWorld.vehicle, node: '4,0' } },
  firstLead: 'Your bridge came with you. Predict what happens before changing anything.',
  hints: [
    'Which beams carried the most force last time? Are they still the ones doing the work?',
    'The load path is the route the weight takes to the cliffs. Moving the truck moves the path.',
    'Make sure every road joint is part of a triangle, not just the one under the truck.',
  ],
  reveal: {
    ...bridgeLesson.reveal,
    title: 'Where the load goes',
    lead: 'The laws didn’t change, but the path did. The weight now takes the shortest stiff route to the nearer cliff.',
  },
  transfer: null,
};
