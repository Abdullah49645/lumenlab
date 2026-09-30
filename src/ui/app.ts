import { analyzeGears, checkPlacement, type GearSize, type GearsConfig, type GearsResult, type GearsWorld } from '../engine/gears';
import { DT, type SimResult } from '../engine/projectile';
import { DESCEND, RAMP, frameAt, isUsablePoint, membersOf, parseKey, type BridgeConfig, type BridgeResult, type BridgeWorld } from '../engine/truss';
import type { ProjectileWorld, Vec2 } from '../engine/types';
import { initialState, lastRun, lastSuccess, reduce, type Action, type ExperimentRun, type LabState, type Phase } from '../experiment/machine';
import { simulateFor } from '../experiment/replay';
import { moduleFor } from '../experiments';
import { addBeam, removeBeam } from '../experiments/bridge';
import { placeGear } from '../experiments/gears';
import type { Direction, ExperimentConfig, Prediction, ProjectileConfig, SpeedGuess } from '../experiments/types';
import { getLesson, homeLessons } from '../lessons';
import type { LessonDefinition, ToolDefinition } from '../lessons/schema';
import { h, pad2 } from './dom';
import { LabRenderer, type Scene } from './renderer';

/** The learning loop shown in the top bar. It is a real sequence, so it is numbered. */
const LOOP: { label: string; phases: Phase[] }[] = [
  { label: 'Construct', phases: ['build'] },
  { label: 'Predict', phases: ['predict'] },
  { label: 'Run', phases: ['running'] },
  { label: 'Observe', phases: ['result'] },
  { label: 'Explain', phases: ['reflect'] },
  { label: 'Understand', phases: ['reveal'] },
];

const HOME_LESSON = 'projectile-earth';
const HOME_DEMO: ProjectileConfig = { kind: 'projectile', angleDeg: 38, speed: 16 }; // verified in tests

type LayerKey = 'strobe' | 'vectors' | 'forces' | 'speeds';
const LAYERS: Record<string, { key: LayerKey; label: string }[]> = {
  projectile: [
    { key: 'strobe', label: 'Position dots' },
    { key: 'vectors', label: 'Velocity arrows' },
  ],
  bridge: [{ key: 'forces', label: 'Pull and push' }],
  gears: [{ key: 'speeds', label: 'Speeds' }],
};

interface Playback {
  lessonId: string;
  attempt: number;
  replay: boolean;
  result: unknown;
  duration: number;
  start: number;
  speed: number;
  finishedAt: number | null;
}

export function mountApp(root: HTMLElement): void {
  let state: LabState = initialState();
  let playback: Playback | null = null;
  let phaseStart = performance.now();
  let dirty = true;
  let hasInteracted = false;
  let dragging: 'aim' | 'predict' | null = null;
  const layers: Record<LayerKey, boolean> = { strobe: false, vectors: false, forces: false, speeds: false };
  const keys: Record<string, string> = {};
  let updaters: (() => void)[] = [];

  /** Editing state that belongs to the UI, not to the learning loop. */
  const ui = {
    message: '',
    bridgePending: null as string | null,
    bridgeHover: null as string | null,
    bridgeCursor: null as string | null,
    gearSize: 'small' as GearSize,
    gearHover: null as Vec2 | null,
    gearCursor: null as Vec2 | null,
  };

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion.matches;
  const lesson = (): LessonDefinition => getLesson(state.lessonId ?? HOME_LESSON);
  const engine = () => lesson().world.engine;

  // ── shell ──────────────────────────────────────────────────────────────
  const topbar = h('header', { class: 'topbar' });
  const canvas = h('canvas', { class: 'lab-canvas', tabIndex: 0, role: 'img', 'aria-label': 'Physics laboratory' });
  const telemetry = h('div', { class: 'telemetry', 'aria-hidden': 'true' });
  const countdown = h('div', { class: 'countdown', 'aria-hidden': 'true' });
  const overlay = h('div', { class: 'stage-overlay' });
  const stage = h('section', { class: 'stage' }, canvas, telemetry, countdown, overlay);
  const panel = h('aside', { class: 'panel', 'aria-label': 'Experiment' });
  const timeline = h('footer', { class: 'timeline' });
  const announcer = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const shell = h('div', { class: 'app' }, topbar, h('main', { class: 'main' }, stage, panel), timeline, announcer);
  root.append(shell);

  let renderer: LabRenderer;
  try {
    renderer = new LabRenderer(canvas);
  } catch (err) {
    root.replaceChildren(h('p', { class: 'fatal' }, (err as Error).message));
    return;
  }
  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    renderer.resize(r.width, r.height);
    dirty = true;
  }).observe(stage);
  motion.addEventListener('change', () => (dirty = true));

  const homeDemo = simulateFor<SimResult>(HOME_LESSON, HOME_DEMO);

  // ── dispatch ───────────────────────────────────────────────────────────
  function dispatch(action: Action) {
    hasInteracted = true;
    const prev = state;
    state = reduce(state, action);
    if (state === prev) return;
    if (state.lessonId !== prev.lessonId) {
      for (const k of Object.keys(layers) as LayerKey[]) layers[k] = false;
      ui.message = '';
      ui.bridgePending = null;
      ui.bridgeCursor = null;
      ui.gearCursor = null;
    }
    if (state.phase !== prev.phase) {
      phaseStart = performance.now();
      if (state.phase !== 'build') ui.bridgePending = null;
      if (state.phase === 'build' && prev.phase !== 'build') ui.message = '';
    }
    if (state.phase === 'running' && (prev.phase !== 'running' || prev.playing !== state.playing)) startPlayback();
    if (state.phase !== 'running') {
      playback = null;
      countdown.classList.remove('show');
    }
    if (state.phase === 'reveal' && prev.phase !== 'reveal') {
      for (const l of LAYERS[engine()]) layers[l.key] = true;
    }
    if (prev.phase === 'running' && state.phase === 'result') {
      const run = lastRun(state)!;
      announcer.textContent = `${run.evaluation.headline}. ${run.evaluation.details.join(' ')} ${run.feedback.text}`;
    }
    renderUI(prev.phase !== state.phase);
    dirty = true;
  }

  function setMessage(text: string) {
    ui.message = text;
    renderUI(false);
    dirty = true;
  }

  function startPlayback() {
    const playing = state.playing!;
    const run = state.runs.find((r) => r.attempt === playing.attempt)!;
    const L = getLesson(run.lessonId);
    const result = simulateFor(run.lessonId, run.config);
    const now = performance.now();
    const countMs = reduced() || playing.replay ? 0 : 1200;
    // Bridge replays run in slow motion: the collapse is the thing worth watching twice.
    const speed = playing.replay && L.world.engine === 'bridge' ? 0.45 : 1;
    playback = { lessonId: run.lessonId, attempt: run.attempt, replay: playing.replay, result, duration: moduleFor(L).duration(result), start: now + countMs, speed, finishedAt: null };
  }

  function skipPlayback() {
    if (!playback) return;
    playback.start = performance.now() - (playback.duration / playback.speed) * 1000 - 1;
  }

  const playTime = (pb: Playback, now: number) => Math.min(pb.duration, (Math.max(0, now - pb.start) / 1000) * pb.speed);

  // ── frame loop ─────────────────────────────────────────────────────────
  function tick(now: number) {
    if (state.phase === 'running' && playback) {
      const pb = playback;
      if (now < pb.start) {
        countdown.textContent = String(Math.ceil((pb.start - now) / 400));
        countdown.classList.add('show');
      } else countdown.classList.remove('show');
      const t = playTime(pb, now);
      if (t >= pb.duration && pb.finishedAt === null) pb.finishedAt = now;
      telemetry.textContent = telemetryText(pb.lessonId, pb.result, t);
      if (pb.finishedAt !== null && now - pb.finishedAt > (reduced() ? 200 : 900)) dispatch({ type: 'PLAYBACK_DONE' });
    }
    const animating = state.phase === 'home' || state.phase === 'running' || state.phase === 'reveal' || engine() === 'bridge' || (engine() === 'gears' && (state.phase === 'result' || state.phase === 'reflect'));
    if (animating || dirty) {
      renderer.draw(buildScene(now));
      dirty = false;
    }
    requestAnimationFrame(tick);
  }

  function telemetryText(lessonId: string, result: unknown, t: number): string {
    const L = getLesson(lessonId);
    if (L.world.engine === 'projectile') {
      const r = result as SimResult;
      const f = r.frames[Math.min(Math.floor(t / DT), r.frames.length - 1)];
      const base = `t ${f.t.toFixed(2)} s   x ${f.x.toFixed(2)} m   y ${f.y.toFixed(2)} m`;
      return state.revealed ? `${base}\nvx ${f.vx.toFixed(2)} m/s   vy ${f.vy.toFixed(2)} m/s` : base;
    }
    if (L.world.engine === 'bridge') {
      const r = result as BridgeResult;
      const f = frameAt(r, t);
      const w = L.world as BridgeWorld;
      const snapped = r.analysis.events.filter((e) => e.f <= f.load + 1e-12).length;
      const collapse = r.analysis.collapse;
      const falling = collapse && t > DESCEND + collapse.f * RAMP + 0.05;
      const status = falling ? '\ncollapsing' : snapped ? `\nbeams broken ${snapped}` : '';
      return `load ${Math.round(f.load * 100)}%   truck ${(f.load * w.vehicle.force).toFixed(1)} of ${w.vehicle.force} kN${status}`;
    }
    const r = result as GearsResult;
    const out = r.analysis.outputRpm;
    const w = L.world as GearsWorld;
    const outText = out === null ? 'not driven' : out === 0 ? 'locked' : `${Math.abs(out).toFixed(0)} rpm ${out > 0 ? 'cw' : 'ccw'}`;
    return `t ${t.toFixed(1)} s   motor ${w.motor.rpm} rpm cw   output ${outText}`;
  }

  // ── scenes ─────────────────────────────────────────────────────────────
  let sceneShake = { x: 0, y: 0 };
  function buildScene(now: number): Scene {
    const dim = state.phase === 'home' ? 0.5 : state.phase === 'intro' ? 0.55 : 0;
    sceneShake = state.phase === 'running' && engine() === 'projectile' ? impactShake(now) : { x: 0, y: 0 };
    if (state.phase === 'home') return { ...homeScene(now), dim, shake: { x: 0, y: 0 } };
    const L = lesson();
    const body = L.world.engine === 'projectile' ? projectileScene(L, now) : L.world.engine === 'bridge' ? bridgeScene(L, now) : gearsScene(L, now);
    return { ...body, dim, shake: sceneShake };
  }

  function impactShake(now: number) {
    if (!playback || playback.finishedAt === null || reduced()) return { x: 0, y: 0 };
    const age = (now - playback.finishedAt) / 650;
    const amp = 3.5 * Math.max(0, 1 - age * 2.5);
    return { x: Math.sin(now / 17) * amp, y: Math.cos(now / 23) * amp };
  }

  function homeScene(now: number) {
    const len = homeDemo.frames.length;
    const cycleMs = len * DT * 1000 + 1800;
    const idx = Math.min(Math.floor((now % cycleMs) / 1000 / DT), len - 1);
    return {
      kind: 'projectile' as const,
      world: getLesson(HOME_LESSON).world as ProjectileWorld,
      config: HOME_DEMO,
      showAimGuide: false,
      prediction: null,
      ghosts: [],
      active: { result: homeDemo, index: idx },
      layers: { strobe: false, vectors: false },
      outcomeLink: false,
      targetLit: idx === len - 1 ? 1 : 0,
      burst: null,
    };
  }

  function runFor(attempt: number | undefined): ExperimentRun | undefined {
    return state.runs.find((r) => r.attempt === attempt);
  }

  function projectileScene(L: LessonDefinition, now: number) {
    const world = L.world as ProjectileWorld;
    const latest = lastRun(state);
    const ghostsOf = (runs: ExperimentRun[]) => runs.map((r) => ({ result: simulateFor<SimResult>(r.lessonId, r.config), label: pad2(r.attempt), latest: r === latest }));
    const pointOf = (p: Prediction | null) => (p && p.kind === 'point' && Number.isFinite(p.x) ? { x: p.x, y: p.y } : null);
    const scene = {
      kind: 'projectile' as const,
      world,
      config: state.config as ProjectileConfig,
      showAimGuide: state.phase === 'build',
      prediction: null as Vec2 | null,
      ghosts: [] as ReturnType<typeof ghostsOf>,
      active: null as { result: SimResult; index: number } | null,
      layers: { strobe: false, vectors: false },
      outcomeLink: false,
      targetLit: 0,
      burst: null as number | null,
    };
    const shown = { strobe: layers.strobe, vectors: layers.vectors };
    switch (state.phase) {
      case 'build':
      case 'predict':
        scene.prediction = pointOf(state.prediction);
        scene.ghosts = ghostsOf(state.runs);
        if (latest && state.revealed && (layers.strobe || layers.vectors)) {
          const r = simulateFor<SimResult>(latest.lessonId, latest.config);
          scene.active = { result: r, index: r.frames.length - 1 };
          scene.layers = shown;
        }
        break;
      case 'running': {
        const pb = playback;
        const run = runFor(pb?.attempt);
        if (!pb || !run) break;
        const r = pb.result as SimResult;
        scene.config = run.config as ProjectileConfig;
        scene.ghosts = ghostsOf(state.runs.filter((x) => x !== run));
        scene.prediction = pb.replay ? null : pointOf(run.prediction);
        scene.active = { result: r, index: Math.min(Math.floor(playTime(pb, now) / DT), r.frames.length - 1) };
        if (state.revealed) scene.layers = shown;
        if (pb.finishedAt !== null) {
          scene.targetLit = r.outcome.kind === 'target' ? 1 : 0;
          scene.outcomeLink = !pb.replay;
          if (!reduced()) scene.burst = Math.min(1, (now - pb.finishedAt) / 650);
        }
        break;
      }
      case 'result':
      case 'reflect': {
        const run = latest!;
        const r = simulateFor<SimResult>(run.lessonId, run.config);
        scene.config = run.config as ProjectileConfig;
        scene.ghosts = ghostsOf(state.runs.filter((x) => x !== run));
        scene.active = { result: r, index: r.frames.length - 1 };
        scene.prediction = pointOf(run.prediction);
        scene.outcomeLink = true;
        scene.targetLit = run.evaluation.success ? 1 : 0;
        if (state.revealed) scene.layers = shown;
        break;
      }
      case 'reveal': {
        const run = lastSuccess(state)!;
        const r = simulateFor<SimResult>(run.lessonId, run.config);
        const len = r.frames.length;
        const speed = reduced() ? 1 : 0.5;
        const cycleMs = (len * DT * 1000) / speed + 2200;
        const t = (((now - phaseStart) % cycleMs) * speed) / 1000;
        const idx = Math.min(Math.floor(t / DT), len - 1);
        scene.config = run.config as ProjectileConfig;
        scene.active = { result: r, index: idx };
        scene.targetLit = idx === len - 1 ? 1 : 0;
        scene.layers = shown;
        break;
      }
    }
    return scene;
  }

  function bridgeScene(L: LessonDefinition, now: number) {
    const world = L.world as BridgeWorld;
    const clock = now / 1000;
    const pred = state.prediction && state.prediction.kind === 'bridge' ? state.prediction : null;
    let previewValid = true;
    if (ui.bridgePending && ui.bridgeHover && ui.bridgePending !== ui.bridgeHover && state.config.kind === 'bridge') {
      previewValid = addBeam(L, state.config, ui.bridgePending, ui.bridgeHover).ok;
    }
    const scene = {
      kind: 'bridge' as const,
      world,
      config: state.config as BridgeConfig,
      result: null as BridgeResult | null,
      time: 0,
      mode: 'build' as 'build' | 'predict' | 'play',
      showForces: false,
      showLabels: false,
      hover: state.phase === 'build' ? ui.bridgeHover : null,
      pending: state.phase === 'build' ? ui.bridgePending : null,
      previewValid,
      cursor: state.phase === 'build' ? ui.bridgeCursor : null,
      predictedMember: null as string | null,
      highlightMembers: [] as string[],
      highlightNode: null as string | null,
      clock,
    };
    const playRun = (run: ExperimentRun, t: number, final: boolean) => {
      scene.result = simulateFor<BridgeResult>(run.lessonId, run.config);
      scene.config = run.config as BridgeConfig;
      scene.mode = 'play';
      scene.time = t;
      scene.showForces = state.revealed && layers.forces;
      if (final) {
        scene.showLabels = true;
        scene.highlightMembers = run.evaluation.highlight.members ?? [];
        scene.highlightNode = run.evaluation.highlight.node ?? null;
      }
    };
    switch (state.phase) {
      case 'predict':
        scene.mode = 'predict';
        scene.showLabels = true;
        scene.predictedMember = pred?.memberId ?? null;
        break;
      case 'running': {
        const pb = playback;
        const run = runFor(pb?.attempt);
        if (!pb || !run) break;
        playRun(run, playTime(pb, now), false);
        const r = pb.result as BridgeResult;
        const firstBreak = r.analysis.events[0] ? DESCEND + r.analysis.events[0].f * RAMP : r.analysis.collapse ? DESCEND + r.analysis.collapse.f * RAMP : null;
        const t = playTime(pb, now);
        if (firstBreak !== null && !reduced() && t > firstBreak && t < firstBreak + 0.5) {
          const amp = 4 * (1 - (t - firstBreak) / 0.5);
          sceneShake = { x: Math.sin(now / 15) * amp, y: Math.cos(now / 19) * amp };
        }
        break;
      }
      case 'result':
      case 'reflect': {
        const run = lastRun(state)!;
        const r = simulateFor<BridgeResult>(run.lessonId, run.config);
        playRun(run, r.duration, true);
        break;
      }
      case 'reveal': {
        const run = lastSuccess(state)!;
        const r = simulateFor<BridgeResult>(run.lessonId, run.config);
        const cycle = r.duration + 2.5;
        playRun(run, Math.min(r.duration, ((now - phaseStart) / 1000) % cycle), false);
        scene.showLabels = true;
        break;
      }
    }
    return scene;
  }

  function gearsScene(L: LessonDefinition, now: number) {
    const world = L.world as GearsWorld;
    const clock = now / 1000;
    const cfg = state.config as GearsConfig;
    let hover: { x: number; y: number; size: GearSize; ok: boolean } | null = null;
    if (state.phase === 'build' && ui.gearHover) {
      const onGear = cfg.gears.some((g) => Math.hypot(g.x - ui.gearHover!.x, g.y - ui.gearHover!.y) < world.radius[g.size]);
      if (!onGear) hover = { ...ui.gearHover, size: ui.gearSize, ok: checkPlacement(world, cfg, ui.gearHover.x, ui.gearHover.y, ui.gearSize).ok };
    }
    const scene = {
      kind: 'gears' as const,
      world,
      config: cfg,
      analysis: analyzeGears(world, cfg),
      time: 0,
      moving: false,
      hover,
      cursor: state.phase === 'build' ? ui.gearCursor : null,
      showSpeeds: false,
      highlight: [] as number[],
      clock,
    };
    const spin = (run: ExperimentRun, t: number, highlight: boolean) => {
      const r = simulateFor<GearsResult>(run.lessonId, run.config);
      scene.config = run.config as GearsConfig;
      scene.analysis = r.analysis;
      scene.moving = true;
      scene.time = t;
      scene.showSpeeds = state.revealed && layers.speeds;
      if (highlight) scene.highlight = run.evaluation.highlight.gears ?? [];
    };
    switch (state.phase) {
      case 'running': {
        const pb = playback;
        const run = runFor(pb?.attempt);
        if (pb && run) spin(run, playTime(pb, now), false);
        break;
      }
      case 'result':
      case 'reflect':
        spin(lastRun(state)!, (now - phaseStart) / 1000 + 4, true);
        break;
      case 'reveal':
        spin(lastSuccess(state)!, (now - phaseStart) / 1000, true);
        break;
    }
    return scene;
  }

  // ── canvas input ───────────────────────────────────────────────────────
  function worldPoint(e: PointerEvent): Vec2 {
    const r = canvas.getBoundingClientRect();
    return renderer.toWorld(e.clientX - r.left, e.clientY - r.top, lesson().world.view);
  }

  // Projectile
  function nearLauncher(p: Vec2) {
    const l = (lesson().world as ProjectileWorld).launcher;
    return Math.hypot(p.x - l.x, p.y - l.y) < 3.5;
  }
  function aimAt(p: Vec2) {
    const l = (lesson().world as ProjectileWorld).launcher;
    dispatch({ type: 'SET_PARAM', key: 'angleDeg', value: (Math.atan2(p.y - l.y, p.x - l.x) * 180) / Math.PI });
  }

  // Bridge
  function nearestJoint(p: Vec2): string | null {
    const w = lesson().world as BridgeWorld;
    const g = w.grid;
    const x = Math.round((p.x - g.minX) / g.step) * g.step + g.minX;
    const y = Math.round((p.y - g.minY) / g.step) * g.step + g.minY;
    const k = `${x},${y}`;
    return Math.hypot(p.x - x, p.y - y) < g.step * 0.4 && isUsablePoint(w, k) ? k : null;
  }
  function nearestMember(p: Vec2, includeRoad: boolean): { id: string; index: number } | null {
    const w = lesson().world as BridgeWorld;
    const cfg = state.config as BridgeConfig;
    let best: { id: string; index: number; d: number } | null = null;
    membersOf(w, cfg).forEach((m) => {
      if (m.deck && !includeRoad) return;
      const [ax, ay] = parseKey(m.a);
      const [bx, by] = parseKey(m.b);
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
      if (d < 0.45 && (!best || d < best.d)) best = { id: m.id, index: m.deck ? -1 : Number(m.id.slice(1)) - 1, d };
    });
    return best;
  }
  function bridgeClick(joint: string | null, p: Vec2 | null) {
    const L = lesson();
    const cfg = state.config as BridgeConfig;
    if (joint) {
      if (!ui.bridgePending) {
        ui.bridgePending = joint;
        return setMessage('Now pick the joint at the other end of the beam.');
      }
      if (ui.bridgePending === joint) {
        ui.bridgePending = null;
        return setMessage('Stopped. Click any joint to start a new beam.');
      }
      const r = addBeam(L, cfg, ui.bridgePending, joint);
      if (!r.ok) return setMessage(r.reason);
      ui.bridgePending = joint;
      ui.message = `Beam B${pad2(r.config.beams.length)} added. Keep going from here, or click this joint again to stop.`;
      return dispatch({ type: 'SET_CONFIG', config: r.config });
    }
    if (p) {
      const m = nearestMember(p, false);
      if (m) {
        ui.bridgePending = null;
        ui.message = `Removed ${m.id}. Beams after it are renumbered.`;
        return dispatch({ type: 'SET_CONFIG', config: removeBeam(cfg, m.index) });
      }
    }
    if (ui.bridgePending) {
      ui.bridgePending = null;
      setMessage('Stopped. Click any joint to start a new beam.');
    }
  }
  function undoBeam() {
    const cfg = state.config as BridgeConfig;
    if (!cfg.beams.length) return;
    ui.bridgePending = null;
    ui.message = `Removed B${pad2(cfg.beams.length)}.`;
    dispatch({ type: 'SET_CONFIG', config: removeBeam(cfg, cfg.beams.length - 1) });
  }

  // Gears
  function nearestPeg(p: Vec2): Vec2 | null {
    const pg = (lesson().world as GearsWorld).pegs;
    const x = Math.round((p.x - pg.minX) / pg.step) * pg.step + pg.minX;
    const y = Math.round((p.y - pg.minY) / pg.step) * pg.step + pg.minY;
    return x < pg.minX || x > pg.maxX || y < pg.minY || y > pg.maxY ? null : { x, y };
  }
  function gearClick(p: Vec2) {
    const L = lesson();
    const w = L.world as GearsWorld;
    const cfg = state.config as GearsConfig;
    const hit = cfg.gears.findIndex((g) => Math.hypot(g.x - p.x, g.y - p.y) < w.radius[g.size] * 0.9);
    if (hit >= 0) {
      ui.message = `Removed G${hit + 1}. Gears after it are renumbered.`;
      return dispatch({ type: 'SET_CONFIG', config: { ...cfg, gears: cfg.gears.filter((_, i) => i !== hit) } });
    }
    const peg = nearestPeg(p);
    if (!peg) return;
    const r = placeGear(L, cfg, peg.x, peg.y, ui.gearSize);
    if (!r.ok) return setMessage(r.reason);
    const teeth = w.teeth[ui.gearSize];
    ui.message = r.meshesWith.length
      ? `Placed G${r.config.gears.length} (${teeth} teeth). Its teeth touch ${r.meshesWith.map((n) => (n === 'Motor' || n === 'Output' ? 'the ' + n.toLowerCase() : n)).join(' and ')}.`
      : `Placed G${r.config.gears.length} (${teeth} teeth). It isn’t touching any other gear.`;
    dispatch({ type: 'SET_CONFIG', config: r.config });
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = worldPoint(e);
    const kind = engine();
    if (kind === 'projectile') {
      if (state.phase === 'predict') {
        dragging = 'predict';
        dispatch({ type: 'SET_PREDICTION', prediction: { kind: 'point', ...p } });
      } else if (state.phase === 'build' && nearLauncher(p)) {
        dragging = 'aim';
        aimAt(p);
      } else return;
      canvas.setPointerCapture(e.pointerId);
    } else if (kind === 'bridge') {
      if (state.phase === 'build') bridgeClick(nearestJoint(p), p);
      else if (state.phase === 'predict') {
        const m = nearestMember(p, true);
        if (m) dispatch({ type: 'SET_PREDICTION', prediction: { kind: 'bridge', holds: false, memberId: m.id } });
      }
    } else if (kind === 'gears' && state.phase === 'build') gearClick(p);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = worldPoint(e);
    const kind = engine();
    let cursor = 'default';
    if (kind === 'projectile') {
      if (dragging === 'predict') dispatch({ type: 'SET_PREDICTION', prediction: { kind: 'point', ...p } });
      else if (dragging === 'aim') aimAt(p);
      cursor = state.phase === 'predict' ? 'crosshair' : state.phase === 'build' && nearLauncher(p) ? (dragging ? 'grabbing' : 'grab') : 'default';
    } else if (kind === 'bridge' && state.phase === 'build') {
      const j = nearestJoint(p);
      if (j !== ui.bridgeHover) {
        ui.bridgeHover = j;
        dirty = true;
      }
      cursor = j || nearestMember(p, false) ? 'pointer' : 'default';
    } else if (kind === 'bridge' && state.phase === 'predict') {
      cursor = nearestMember(p, true) ? 'pointer' : 'default';
    } else if (kind === 'gears' && state.phase === 'build') {
      const peg = nearestPeg(p);
      if (JSON.stringify(peg) !== JSON.stringify(ui.gearHover)) {
        ui.gearHover = peg;
        dirty = true;
      }
      cursor = peg ? 'pointer' : 'default';
    }
    canvas.style.cursor = cursor;
  });
  canvas.addEventListener('pointerleave', () => {
    ui.bridgeHover = null;
    ui.gearHover = null;
    dirty = true;
  });
  const endDrag = () => (dragging = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', (e) => {
    const big = e.shiftKey;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const dir = arrows[e.key];
    const kind = engine();
    const L = lesson();

    if (kind === 'projectile' && state.phase === 'predict') {
      const v = L.world.view;
      const cur = state.prediction && state.prediction.kind === 'point' && Number.isFinite(state.prediction.x) ? state.prediction : { x: v.width / 2, y: 0 };
      const step = big ? 2 : 0.5;
      if (dir) {
        e.preventDefault();
        dispatch({ type: 'SET_PREDICTION', prediction: { kind: 'point', x: cur.x + dir[0] * step, y: cur.y + dir[1] * step } });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        dispatch({ type: 'RUN', timestamp: Date.now() });
      }
    } else if (kind === 'projectile' && state.phase === 'build') {
      const c = state.config as ProjectileConfig;
      if (dir) {
        e.preventDefault();
        if (dir[1] !== 0) dispatch({ type: 'SET_PARAM', key: 'angleDeg', value: c.angleDeg + dir[1] * (big ? 5 : 1) });
        else dispatch({ type: 'SET_PARAM', key: 'speed', value: c.speed + dir[0] * (big ? 2 : 0.5) });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        dispatch({ type: 'BEGIN_PREDICT' });
      }
    } else if (kind === 'bridge' && state.phase === 'build') {
      const w = L.world as BridgeWorld;
      if (dir) {
        e.preventDefault();
        const [cx, cy] = ui.bridgeCursor ? parseKey(ui.bridgeCursor) : [0, 0];
        const g = w.grid;
        const nx = Math.max(g.minX, Math.min(g.maxX, cx + dir[0] * g.step));
        const ny = Math.max(g.minY, Math.min(g.maxY, cy + dir[1] * g.step));
        ui.bridgeCursor = `${nx},${ny}`;
        ui.bridgeHover = ui.bridgeCursor;
        setMessage(isUsablePoint(w, ui.bridgeCursor) ? `Joint at (${nx} m, ${ny} m). Enter picks it.` : `(${nx} m, ${ny} m) is inside the cliff.`);
      } else if (e.key === 'Enter' && ui.bridgeCursor) {
        e.preventDefault();
        bridgeClick(isUsablePoint(w, ui.bridgeCursor) ? ui.bridgeCursor : null, null);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        undoBeam();
      } else if (e.key === 'Escape') {
        ui.bridgePending = null;
        setMessage('Stopped.');
      }
    } else if (kind === 'gears' && state.phase === 'build') {
      const w = L.world as GearsWorld;
      if (dir) {
        e.preventDefault();
        const cur = ui.gearCursor ?? { x: w.motor.x + 3, y: w.motor.y };
        const step = big ? 1 : w.pegs.step;
        ui.gearCursor = {
          x: Math.max(w.pegs.minX, Math.min(w.pegs.maxX, cur.x + dir[0] * step)),
          y: Math.max(w.pegs.minY, Math.min(w.pegs.maxY, cur.y + dir[1] * step)),
        };
        ui.gearHover = ui.gearCursor;
        setMessage(`Peg at (${ui.gearCursor.x}, ${ui.gearCursor.y}). Enter places or removes a gear.`);
      } else if (e.key === 'Enter' && ui.gearCursor) {
        e.preventDefault();
        gearClick(ui.gearCursor);
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        ui.gearSize = (['small', 'medium', 'large'] as GearSize[])[Number(e.key) - 1];
        setMessage(`Placing ${w.teeth[ui.gearSize]}-tooth gears.`);
      }
    }
  });

  // ── UI rendering (rebuilt only when its key changes) ───────────────────
  function swap(container: HTMLElement, name: string, key: string, build: () => Node | (Node | null)[]) {
    if (keys[name] === key) return false;
    keys[name] = key;
    const fid = (document.activeElement as HTMLElement | null)?.dataset?.fid;
    const nodes = build();
    container.replaceChildren(...(Array.isArray(nodes) ? nodes : [nodes]).filter((n): n is Node => n !== null));
    if (fid) container.querySelector<HTMLElement>(`[data-fid="${fid}"]`)?.focus({ preventScroll: true });
    return true;
  }

  function renderUI(phaseChanged: boolean) {
    const L = state.lessonId ? getLesson(state.lessonId) : null;
    shell.dataset.phase = state.phase;
    shell.dataset.engine = L?.world.engine ?? 'home';
    shell.classList.toggle('is-home', state.phase === 'home');
    const base = `${state.phase}|${state.lessonId}`;
    swap(topbar, 'top', base, () => renderTopbar(L));
    swap(overlay, 'overlay', base, () => renderOverlay(L));
    if (
      swap(panel, 'panel', `${base}|${state.runs.length}|${state.hintLevel}|${state.revealed}`, () => {
        updaters = [];
        return renderPanel(L);
      })
    )
      panel.scrollTop = 0;
    swap(timeline, 'timeline', `${base}|${state.runs.length}|${state.revealed}|${JSON.stringify(layers)}`, () => renderTimeline(L));
    for (const u of updaters) u();
    if (state.phase === 'result' && L) {
      const run = lastRun(state)!;
      const r = simulateFor(run.lessonId, run.config);
      telemetry.textContent = telemetryText(run.lessonId, r, moduleFor(L).duration(r));
    } else if (state.phase !== 'running' && state.phase !== 'reflect') telemetry.textContent = '';
    canvas.setAttribute('aria-label', L ? moduleFor(L).describe(L, state.config) : 'A launcher fires a glowing ball in an arc onto a target standing on a tower.');
    if (phaseChanged && hasInteracted) focusPrimary();
  }

  function focusPrimary() {
    const toCanvas = state.phase === 'predict' && engine() === 'projectile';
    const target = toCanvas ? canvas : shell.querySelector<HTMLElement>('[data-primary]:not([disabled])');
    target?.focus({ preventScroll: true });
  }

  const button = (label: string, onclick: () => void, opts: { kind?: 'primary' | 'secondary' | 'quiet'; fid: string; disabled?: boolean }) =>
    h(
      'button',
      {
        class: `btn ${opts.kind ?? 'secondary'}`,
        onclick,
        disabled: opts.disabled,
        'data-fid': opts.fid,
        'data-primary': opts.kind === 'primary' ? true : undefined,
        type: 'button',
      },
      label,
    );

  /** A pressed/unpressed choice button whose state updates live. */
  const choice = (label: string, fid: string, pressed: () => boolean, onclick: () => void, disabled?: () => boolean) => {
    const b = h('button', { type: 'button', class: 'choice', 'data-fid': fid, onclick }, label);
    updaters.push(() => {
      b.setAttribute('aria-pressed', String(pressed()));
      b.disabled = disabled ? disabled() : false;
    });
    return b;
  };

  const liveText = (tag: 'p' | 'span', cls: string, text: () => string, live = false) => {
    const el = h(tag, { class: cls, 'aria-live': live ? 'polite' : undefined });
    updaters.push(() => {
      el.textContent = text();
    });
    return el;
  };

  function renderTopbar(L: LessonDefinition | null): Node[] {
    const brand = h(
      'button',
      { class: 'brand', type: 'button', onclick: () => dispatch({ type: 'HOME' }), 'aria-label': 'LumenLab, back to start', 'data-fid': 'brand' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'brand-word' }, 'Lumen', h('span', {}, 'Lab')),
    );
    if (!L || state.phase === 'home') return [brand];
    const objective = h('div', { class: 'objective' }, h('span', { class: 'objective-domain' }, `${L.domain}, experiment ${L.code}`), h('span', { class: 'objective-text' }, L.challenge.prompt));
    const loop = h(
      'ol',
      { class: 'loop', 'aria-label': 'Learning loop' },
      LOOP.map((s) => {
        const on = s.phases.includes(state.phase);
        return h('li', { class: on ? 'on' : '', 'aria-current': on ? 'step' : undefined }, s.label);
      }),
    );
    return [brand, objective, loop];
  }

  function renderOverlay(L: LessonDefinition | null): Node[] {
    if (state.phase === 'home') {
      return [
        h(
          'div',
          { class: 'home' },
          h('h1', { class: 'home-title' }, 'Learn physics by making it happen.'),
          h('p', { class: 'home-sub' }, 'Build an experiment. Predict what it will do. Run it, and work out why it did that. The formula comes last, as the explanation for something you already saw.'),
          h('p', { class: 'home-q' }, 'What do you want to make happen?'),
          h(
            'div',
            { class: 'cards' },
            homeLessons.map((l, i) =>
              h(
                'button',
                { class: 'challenge-card', type: 'button', onclick: () => dispatch({ type: 'OPEN_LESSON', lessonId: l.id }), 'data-primary': i === 0 ? true : undefined, 'data-fid': `open-${l.id}` },
                h('span', { class: 'card-domain' }, l.domain),
                h('span', { class: 'card-title' }, l.challenge.prompt),
                h('span', { class: 'card-meta' }, `About ${l.estMinutes} minutes. You'll meet ${l.concepts.slice(0, 2).join(' and ').toLowerCase()}.`),
              ),
            ),
          ),
        ),
      ];
    }
    if (state.phase === 'intro' && L) {
      return [
        h(
          'div',
          { class: 'intro', role: 'dialog', 'aria-labelledby': 'intro-title' },
          h('p', { class: 'intro-q' }, 'What are you trying to do?'),
          h('h2', { class: 'intro-title', id: 'intro-title' }, L.challenge.prompt),
          L.challenge.brief.map((b) => h('p', { class: 'intro-line' }, b)),
          h('ul', { class: 'intro-constraints', 'aria-label': 'Limits' }, L.challenge.constraints.map((c) => h('li', {}, c))),
          h(
            'div',
            { class: 'intro-actions' },
            button('Enter the lab', () => dispatch({ type: 'ENTER_LAB' }), { kind: 'primary', fid: 'enter' }),
            button('Back', () => dispatch({ type: 'HOME' }), { kind: 'quiet', fid: 'intro-back' }),
          ),
        ),
      ];
    }
    return [];
  }

  function renderPanel(L: LessonDefinition | null): (Node | null)[] {
    if (!L) return [];
    switch (state.phase) {
      case 'intro':
        return [section('In this experiment', h('p', { class: 'pn-text' }, `You'll meet ${L.concepts.join(', ').toLowerCase()}.`)), modelNote(L)];
      case 'build':
        return buildPanel(L);
      case 'predict':
        return predictPanel(L);
      case 'running':
        return runningPanel();
      case 'result':
        return resultPanel();
      case 'reflect':
        return reflectPanel(L);
      case 'reveal':
        return revealPanel(L);
      default:
        return [];
    }
  }

  function section(title: string, ...children: (Node | Node[] | null | false)[]) {
    return h('section', { class: 'pn-section' }, h('h3', { class: 'pn-title' }, title), ...children);
  }

  const modelNote = (L: LessonDefinition) => h('details', { class: 'model-note' }, h('summary', {}, 'What this model leaves out'), h('p', {}, L.modelNote));

  const fmtTool = (t: ToolDefinition, v: number) => (t.unit === '°' ? `${v}°` : `${v.toFixed(1)} ${t.unit}`);

  function control(tool: ToolDefinition) {
    const id = `tool-${tool.key}`;
    const readout = h('output', { class: 'readout', htmlFor: id });
    const value = () => (state.config as ProjectileConfig)[tool.key];
    const input = h('input', {
      type: 'range',
      id,
      min: tool.min,
      max: tool.max,
      step: tool.step,
      value: value(),
      'data-fid': id,
      oninput: (e: Event) => dispatch({ type: 'SET_PARAM', key: tool.key, value: Number((e.target as HTMLInputElement).value) }),
    });
    updaters.push(() => {
      if (state.config.kind !== 'projectile') return;
      if (input.value !== String(value())) input.value = String(value());
      readout.textContent = fmtTool(tool, value());
      input.setAttribute('aria-valuetext', fmtTool(tool, value()));
    });
    return h(
      'div',
      { class: 'control' },
      h('label', { class: 'control-label', htmlFor: id }, h('span', {}, tool.label), readout),
      input,
      h('div', { class: 'control-range', 'aria-hidden': 'true' }, h('span', {}, fmtTool(tool, tool.min)), h('span', {}, fmtTool(tool, tool.max))),
    );
  }

  function hintsSection(L: LessonDefinition) {
    if (!state.runs.some((r) => !r.evaluation.success) || lastSuccess(state)) return null;
    const shown = L.hints.slice(0, state.hintLevel);
    return section(
      'Stuck?',
      shown.length ? h('ol', { class: 'hint-list' }, shown.map((t) => h('li', {}, t))) : null,
      state.hintLevel < L.hints.length ? button(shown.length ? 'Another hint' : 'Give me a hint', () => dispatch({ type: 'HINT' }), { kind: 'quiet', fid: 'hint' }) : null,
    );
  }

  function buildLead(L: LessonDefinition) {
    const last = lastRun(state);
    if (!last) return h('p', { class: 'pn-lead' }, L.firstLead);
    if (last.evaluation.success) return h('p', { class: 'pn-lead' }, 'It worked. Try a different way, or go and see why.');
    return h('p', { class: 'pn-lead' }, `Last time: ${last.evaluation.summary.toLowerCase()}. What will you change?`);
  }

  function buildPanel(L: LessonDefinition): (Node | null)[] {
    const success = lastSuccess(state);
    const actions = (extra: Node[]) =>
      h(
        'div',
        { class: 'actions' },
        button('Predict the outcome', () => dispatch({ type: 'BEGIN_PREDICT' }), { kind: 'primary', fid: 'predict' }),
        success ? button('See why it worked', () => dispatch({ type: 'REVEAL' }), { fid: 'reveal' }) : null,
        ...extra,
      );
    const message = liveText('p', 'pn-message', () => ui.message, true);

    if (L.world.engine === 'projectile') {
      return [
        buildLead(L),
        h('p', { class: 'pn-text' }, 'Drag the launcher barrel, or use the sliders. With the lab focused, arrow keys work too.'),
        section('Launcher', (L.tools ?? []).map(control)),
        hintsSection(L),
        actions([button('Reset launcher', () => dispatch({ type: 'RESET_SETUP' }), { kind: 'quiet', fid: 'reset' })]),
        modelNote(L),
      ];
    }

    if (L.world.engine === 'bridge') {
      const w = L.world as BridgeWorld;
      const used = () => (state.config as BridgeConfig).beams.reduce((s, [a, b]) => {
        const [ax, ay] = parseKey(a);
        const [bx, by] = parseKey(b);
        return s + Math.hypot(bx - ax, by - ay);
      }, 0);
      const bar = h('div', { class: 'meter-fill' });
      updaters.push(() => {
        bar.style.width = `${Math.min(100, (used() / w.budget) * 100)}%`;
      });
      return [
        buildLead(L),
        h('p', { class: 'pn-text' }, 'Click a joint point, then another, to add a beam. Click a beam to remove it. Keyboard: arrows move, Enter picks a joint, Backspace removes the last beam.'),
        section(
          'Steel',
          h('div', { class: 'meter', 'aria-hidden': 'true' }, bar),
          liveText('p', 'pn-mono', () => `${used().toFixed(1)} of ${w.budget} m used, ${(state.config as BridgeConfig).beams.length} beams`),
        ),
        message,
        hintsSection(L),
        actions([
          button('Remove last beam', undoBeam, { kind: 'quiet', fid: 'undo' }),
          button('Clear all beams', () => {
            ui.bridgePending = null;
            ui.message = 'Cleared.';
            dispatch({ type: 'RESET_SETUP' });
          }, { kind: 'quiet', fid: 'clear' }),
        ]),
        modelNote(L),
      ];
    }

    const w = L.world as GearsWorld;
    const sizes: GearSize[] = ['small', 'medium', 'large'];
    const cfg = () => state.config as GearsConfig;
    return [
      buildLead(L),
      h('p', { class: 'pn-text' }, 'Pick a gear size, then click a peg to place it. Click a gear to remove it. Keyboard: arrows move, Enter places, 1 2 3 pick a size.'),
      section(
        'Gear to place',
        h(
          'div',
          { class: 'choices' },
          sizes.map((s) =>
            choice(`${w.teeth[s]} teeth`, `size-${s}`, () => ui.gearSize === s, () => {
              ui.gearSize = s;
              setMessage(`Placing ${w.teeth[s]}-tooth gears.`);
            }),
          ),
        ),
      ),
      section(
        'Gear on the output shaft',
        h(
          'div',
          { class: 'choices' },
          (['small', 'large'] as GearSize[]).map((s) =>
            choice(`${w.teeth[s]} teeth`, `out-${s}`, () => cfg().outputSize === s, () => {
              ui.message = `The output now has a ${w.teeth[s]}-tooth gear.`;
              dispatch({ type: 'SET_CONFIG', config: { ...cfg(), outputSize: s } });
              renderUI(false);
            }),
          ),
        ),
      ),
      liveText('p', 'pn-mono', () => `${cfg().gears.length} gears placed`),
      message,
      hintsSection(L),
      actions([
        button('Remove last gear', () => {
          if (!cfg().gears.length) return;
          ui.message = `Removed G${cfg().gears.length}.`;
          dispatch({ type: 'SET_CONFIG', config: { ...cfg(), gears: cfg().gears.slice(0, -1) } });
        }, { kind: 'quiet', fid: 'undo' }),
        button('Clear all gears', () => {
          ui.message = 'Cleared.';
          dispatch({ type: 'SET_CONFIG', config: { ...cfg(), gears: [] } });
        }, { kind: 'quiet', fid: 'clear' }),
      ]),
      modelNote(L),
    ];
  }

  function predictPanel(L: LessonDefinition): (Node | null)[] {
    const mod = moduleFor(L);
    const run = button('Run the experiment', () => dispatch({ type: 'RUN', timestamp: Date.now() }), { kind: 'primary', fid: 'run' });
    updaters.push(() => {
      run.disabled = !state.prediction || !mod.predictionReady(state.prediction);
    });
    const actions = h('div', { class: 'actions' }, run, button('Back to building', () => dispatch({ type: 'BACK_TO_BUILD' }), { kind: 'quiet', fid: 'back-build' }));
    const setup = section('Your setup', h('p', { class: 'pn-text' }, mod.describe(L, state.config)));
    const intro = [h('p', { class: 'pn-lead' }, L.prediction.prompt), h('p', { class: 'pn-text' }, L.prediction.help)];

    if (L.world.engine === 'projectile') {
      return [
        ...intro,
        h('p', { class: 'pn-text' }, 'Keyboard: arrow keys move the marker, Shift moves it further, Enter runs.'),
        liveText('p', 'pn-mono', () => {
          const p = state.prediction;
          return p && p.kind === 'point' && Number.isFinite(p.x) ? `Marker at x ${p.x.toFixed(2)} m, y ${p.y.toFixed(2)} m` : 'No marker yet';
        }),
        actions,
      ];
    }

    if (L.world.engine === 'bridge') {
      const pred = () => (state.prediction?.kind === 'bridge' ? state.prediction : { kind: 'bridge' as const, holds: null, memberId: null });
      const set = (holds: boolean) => dispatch({ type: 'SET_PREDICTION', prediction: { kind: 'bridge', holds, memberId: holds ? null : pred().memberId } });
      return [
        ...intro,
        h(
          'div',
          { class: 'choices', role: 'group', 'aria-label': 'Will it hold?' },
          choice('It will hold', 'holds', () => pred().holds === true, () => set(true)),
          choice('It will fail', 'fails', () => pred().holds === false, () => set(false)),
        ),
        liveText('p', 'pn-mono', () => {
          const p = pred();
          if (p.holds === false) return p.memberId ? `You think ${p.memberId} breaks first.` : 'Click a beam in the lab if you want to say which breaks first.';
          return p.holds ? 'You think it will hold.' : 'Choose one.';
        }),
        setup,
        actions,
      ];
    }

    const pred = () => (state.prediction?.kind === 'gears' ? state.prediction : { kind: 'gears' as const, direction: null, speed: null });
    const set = (patch: { direction?: Direction; speed?: SpeedGuess }) => dispatch({ type: 'SET_PREDICTION', prediction: { ...pred(), ...patch } });
    const dirs: [Direction, string][] = [
      ['cw', 'Clockwise'],
      ['ccw', 'Counter-clockwise'],
      ['none', 'It won’t turn'],
    ];
    const speeds: [SpeedGuess, string][] = [
      ['slower', 'Slower'],
      ['same', 'Same speed'],
      ['faster', 'Faster'],
    ];
    return [
      ...intro,
      section('Which way?', h('div', { class: 'choices', role: 'group' }, dirs.map(([d, label]) => choice(label, `dir-${d}`, () => pred().direction === d, () => set({ direction: d }))))),
      section(
        'Compared with the motor',
        h('div', { class: 'choices', role: 'group' }, speeds.map(([sp, label]) => choice(label, `speed-${sp}`, () => pred().speed === sp, () => set({ speed: sp }), () => pred().direction === 'none'))),
      ),
      setup,
      actions,
    ];
  }

  function runningPanel(): (Node | null)[] {
    const p = state.playing!;
    const run = runFor(p.attempt)!;
    const L = getLesson(run.lessonId);
    const slow = p.replay && L.world.engine === 'bridge';
    return [
      h('p', { class: 'pn-lead' }, p.replay ? `Replaying attempt ${pad2(p.attempt)}${slow ? ' in slow motion' : ''}` : `Attempt ${pad2(p.attempt)} is running`),
      h('p', { class: 'pn-text' }, moduleFor(L).describe(L, run.config)),
      p.replay ? h('p', { class: 'pn-text' }, 'Same setup, same engine, so exactly the same result.') : null,
      h('div', { class: 'actions' }, button('Skip to the end', skipPlayback, { kind: 'quiet', fid: 'skip' })),
    ];
  }

  function resultPanel(): (Node | null)[] {
    const run = lastRun(state)!;
    const ev = run.evaluation;
    return [
      h(
        'div',
        { class: `verdict ${ev.success ? 'is-success' : 'is-observe'}` },
        h('p', { class: 'verdict-attempt' }, `Attempt ${pad2(run.attempt)}`),
        h('h2', {}, ev.headline),
        h('p', { class: 'verdict-summary' }, ev.success ? 'Your setup worked.' : `${ev.summary}.`),
      ),
      h('ul', { class: 'detail-list' }, ev.details.map((d) => h('li', {}, d))),
      h('p', { class: `callout${run.feedback.close ? ' is-close' : ''}` }, run.feedback.text),
      !ev.success ? h('p', { class: 'pn-lead small' }, 'What could you change?') : null,
      h(
        'div',
        { class: 'actions' },
        button('Note what you saw', () => dispatch({ type: 'REFLECT' }), { kind: 'primary', fid: 'reflect' }),
        ev.success
          ? button('Skip to why it worked', () => dispatch({ type: 'REVEAL' }), { fid: 'skip-reveal' })
          : button('Change the setup', () => dispatch({ type: 'REVISE' }), { fid: 'revise' }),
        button('Replay this attempt', () => dispatch({ type: 'REPLAY', attempt: run.attempt }), { kind: 'quiet', fid: 'replay' }),
      ),
    ];
  }

  function reflectPanel(L: LessonDefinition): (Node | null)[] {
    const run = lastRun(state)!;
    const [q1, q2] = L.reflection.prompts;
    const a1 = h('input', { type: 'text', id: 'refl-1', maxLength: 160, autocomplete: 'off', 'data-fid': 'refl-1' });
    const a2 = h('input', { type: 'text', id: 'refl-2', maxLength: 160, autocomplete: 'off', 'data-fid': 'refl-2' });
    const form = h(
      'form',
      {
        class: 'reflect-form',
        onsubmit: (e: Event) => {
          e.preventDefault();
          dispatch({ type: 'SUBMIT_REFLECTION', surprised: a1.value, change: a2.value });
        },
      },
      h('div', { class: 'field' }, h('label', { htmlFor: 'refl-1' }, q1), a1),
      h('div', { class: 'field' }, h('label', { htmlFor: 'refl-2' }, run.evaluation.success ? 'What do you think made it work?' : q2), a2),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary', type: 'submit', 'data-primary': true, 'data-fid': 'save-refl' }, run.evaluation.success ? 'Save and see why' : 'Save and revise'),
        button('Skip', () => dispatch({ type: 'SUBMIT_REFLECTION', surprised: '', change: '' }), { kind: 'quiet', fid: 'skip-refl' }),
      ),
    );
    return [h('p', { class: 'pn-lead' }, 'One line each is plenty.'), h('p', { class: 'pn-text' }, 'Your notes are saved with this attempt in your lab notebook.'), form];
  }

  function revealPanel(L: LessonDefinition): (Node | null)[] {
    const run = lastSuccess(state)!;
    const r = simulateFor(run.lessonId, run.config);
    const rows = moduleFor(L).measurements(L, run.config, r);
    return [
      h('p', { class: 'reveal-kicker' }, 'You discovered'),
      h('h2', { class: 'reveal-title' }, L.reveal.title),
      h('p', { class: 'pn-lead' }, L.reveal.lead),
      h('dl', { class: 'discoveries' }, L.reveal.discoveries.flatMap((d) => [h('dt', { 'data-tone': d.tone }, d.label), h('dd', {}, d.text)])),
      h('p', { class: 'pn-text' }, L.reveal.canvasNote),
      section(
        'Written down',
        L.reveal.equations.map((e) => {
          const eq = h('div', { class: 'equation' });
          eq.innerHTML = e.html; // authored lesson data, never user input
          return h('div', { class: 'equation-row' }, h('span', { class: 'equation-label' }, e.label), eq);
        }),
      ),
      section(
        'Checked against your run',
        h('table', { class: 'measure' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v))))),
        h('p', { class: 'pn-text' }, 'The equations agree with what the lab measured, because the lab follows the same rules.'),
      ),
      h(
        'div',
        { class: 'actions' },
        L.transfer
          ? button(L.transfer.label, () => dispatch({ type: 'OPEN_LESSON', lessonId: L.transfer!.lessonId, config: run.config as ExperimentConfig }), { kind: 'primary', fid: 'transfer' })
          : button('Choose another experiment', () => dispatch({ type: 'HOME' }), { kind: 'primary', fid: 'finish' }),
        button('Back to the lab', () => dispatch({ type: 'REVISE' }), { kind: 'quiet', fid: 'back-lab' }),
      ),
      modelNote(L),
    ];
  }

  function renderTimeline(L: LessonDefinition | null): Node[] {
    if (!L || state.phase === 'home' || state.phase === 'intro') return [];
    const canReplay = state.phase === 'build' || state.phase === 'result' || state.phase === 'reveal';
    const latest = lastRun(state);
    const attempts = state.runs.map((r) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `attempt${r.evaluation.success ? ' ok' : ''}${r === latest ? ' latest' : ''}`,
            onclick: () => dispatch({ type: 'REPLAY', attempt: r.attempt }),
            disabled: !canReplay,
            'data-fid': `att-${r.attempt}`,
            'aria-label': `Replay attempt ${r.attempt}: ${r.evaluation.summary}`,
          },
          h('span', { class: 'att-n' }, pad2(r.attempt)),
          h('span', { class: 'att-s' }, r.evaluation.summary),
        ),
      ),
    );
    const toggles = LAYERS[L.world.engine].map(({ key, label }) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(layers[key]),
          'data-fid': `layer-${key}`,
          onclick: () => {
            layers[key] = !layers[key];
            renderUI(false);
            dirty = true;
          },
        },
        label,
      ),
    );
    return [
      h('span', { class: 'tl-label', id: 'tl-attempts' }, 'Attempts'),
      attempts.length ? h('ol', { class: 'tl-history', 'aria-labelledby': 'tl-attempts' }, attempts) : h('span', { class: 'tl-empty' }, 'Each run you make is kept here, and you can replay any of them.'),
      h(
        'div',
        { class: 'tl-right' },
        state.revealed ? [h('span', { class: 'tl-label' }, 'Show'), ...toggles] : null,
        state.runs.length ? h('button', { type: 'button', class: 'chip', onclick: exportNotebook, 'data-fid': 'export' }, 'Download notebook') : null,
      ),
    ];
  }

  function exportNotebook() {
    const data = { app: 'LumenLab', lesson: state.lessonId, exportedAt: new Date().toISOString(), runs: state.runs };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `lumenlab-${state.lessonId}-notebook.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  renderUI(true);
  requestAnimationFrame(tick);
}
