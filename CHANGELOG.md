# Changelog

All notable changes to LumenLab are recorded here, grouped the way the project
is judged: what was added, what changed technically, and what changed about the
learning design.

## Unreleased

### Presentation
- Narrated 2½-minute demo video (`docs/media/lumenlab-demo.mp4`) covering all three experiments.
- README section mapping the project to the FirstCommit 2026 judging focus.

### Added
- Structures experiment, "Build a bridge that holds the truck": joint grid, 48 m steel budget, beam editing with explained refusals, keyboard editing, hold/fail prediction with an optional "which beam breaks first".
- Bridge run: truck lowered on, load ramped, beams coloured by how close they are to their limit, beams snapping, collapse into the river, slow-motion replay.
- Bridge reveal: tension/compression colouring, most loaded beams, equilibrium check at the truck's joint. Transfer lesson with the truck off centre.
- Mechanisms experiment, "Make the output turn clockwise at 120 rpm": gears with 10, 15 or 20 teeth on a peg grid around a housing, choice of output gear, direction and speed prediction.
- Gear reveal: speed and direction on every gear, mesh-by-mesh table and formula check. Transfer lesson: counter-clockwise at 60 rpm.
- Home screen with all three experiments.

### Technical
- Direct stiffness truss solver with singular-matrix mechanism detection and progressive failure.
- Position-based collapse animation, used only when the static analysis finds a collapse.
- Gear engine: meshing as a constraint graph, BFS propagation, odd-loop jam detection, tooth phasing.
- `ExperimentModule` interface; the state machine, replay and result/reveal screens are shared by all experiments.
- Evaluators split per experiment; `Evaluation` now carries highlights (beams, joints, gears) for the canvas.
- Renderer split into a shared painter and one scene per experiment.
- 42 tests (up from 19), including solvability of every lesson and determinism of the bridge animation.

### Learning
- Each experiment has a transfer that changes the situation, not the setting: gravity, where the load sits, required direction.
- Failures name the cause: the beam and load fraction, the floppy joint, the gap in the gear chain, the locking loop.


### Added (projectile)
- Projectile experiment, "Make the ball hit the target": launcher with angle and speed controls, a target on a tower, and a deterministic simulation.
- Full learning loop for that experiment: intro → construct → predict → run → observe → explain → understand → transfer.
- Prediction step: the learner places a marker for where the ball will first touch something; the result reports the distance between prediction and outcome.
- Attempt history with ghost trajectories of every earlier attempt, and one-click replay of any attempt.
- Reveal layer: position dots every 0.2 s and horizontal/vertical velocity arrows drawn over the learner's own winning run, plus the equations checked against that run's numbers.
- Transfer lesson: the same setup on the Moon (g = 1.62 m/s²), carrying over the learner's winning settings.
- Three escalating, lesson-authored hints (no AI).
- "Download notebook": exports every recorded run (config, prediction, outcome, evaluation, reflection) as JSON.
- Responsive layout (canvas-first on mobile), keyboard control of the launcher and the prediction marker, reduced-motion support, screen-reader announcements of results.

### Technical
- Fixed-step engine (1/120 s) with velocity Verlet integration, exact for uniform gravity.
- Continuous collision detection: 8 samples per step along the exact path, refined by bisection, so the reported contact is the first one.
- Pure evaluator: success conditions are data (`target-hit`), measurements come from the simulation, never from estimates.
- Pure reducer for the learning loop; invalid actions (such as repeated Run presses) return the same state.
- Replay by re-simulation: runs store only lesson id + config.
- Lessons are data (`src/lessons/*.ts`); the Moon lesson reuses the Earth lesson with a different world.
- 19 Vitest tests covering determinism, the analytic match, contact detection, NaN safety, every evaluator verdict, solvability of both lessons, the state machine and replay.

### Learning
- The formula appears only after a successful run, as an explanation of what the learner already did.
- Failed attempts are labelled "Observation" with the measured difference, never "Wrong".
- The home screen shows the experiment running rather than describing it.
