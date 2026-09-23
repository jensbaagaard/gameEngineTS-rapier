# Engine rebuild: review notes

## Decision

Replace the prototype core, not the game. Keep the useful technology choices (TypeScript, Rapier, Three.js and WebSockets), but do not preserve the old coupling between game objects, construction, simulation timers, physics, sockets and rendering.

Patching individual TODOs into that coupling would leave the hard problems intact: code-only scenes, creation-order behavior, raw-key replication, rendering tied to packet arrival, implicit public state, no lifecycle ownership and no regression suite. Backward-compatibility wrappers would retain those assumptions without protecting an existing engine consumer. The original implementation remains recoverable in Git history.

This is a foundation replacement, **not completion of every TODO**. It adds separate, small primitives and a workshop that exercises them end-to-end. It does not move Minesweeper, its server or its renderer, nor create a level-editor UI.

## What belongs where

- `src/` is the reusable engine. The root entry point is headless and runtime-neutral; physics and browser modules are optional imports.
- `game/` defines workshop settings, generators, movement, physics construction, public state, wire validation and rooms. Those choices are intentionally not promoted to generic engine policy.
- `main.ts` reads the URL mode and wires the page to `game/local.ts` (in-page simulation) or `game/online.ts` (socket, prediction, interpolation). Scene preview and export need neither.
- `examples/counter.ts` verifies that simulation/replay are useful without the workshop or physics.
- `tests/` covers the reusable contracts and real server/browser integration.

This boundary is provisional: extract more only when the next game demonstrates a genuinely shared need. Do not migrate game rules merely to make the engine look more complete.

## Review in this order

1. `src/schema.ts`, `src/scene.ts`, `game/scene.ts` and the two JSON scenes: validation, ids, deterministic expansion, baking and editor-readable settings.
2. `src/simulation.ts`, `src/session.ts`, `src/clock.ts`, `src/physics.ts`: execution order, lifetime ownership, scene transitions and fixed physics steps.
3. `src/network.ts`, `src/replication.ts`, `game/server.ts`: bounded input, sequence/epoch handling, explicit public projection and full/delta baselines.
4. `main.ts`, `game/local.ts`, `game/online.ts`, `src/browser.ts`, `game/view.ts`: input, prediction, rendering independent of packets and cleanup.
5. `tests/` and `TODO.md`: distinguish what is demonstrated from what still requires game integration or platform evidence.

## Breaking changes

| Prototype                                                      | Replacement                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `engine/` classes with implicit runtime coupling               | `src/` package with separate core/physics/browser entry points                |
| Scene constructors containing game objects                     | Versioned scene documents plus explicit type/generator registry               |
| `GameObject` lifecycle and global ids                          | Game-owned objects, `Entities`, named simulation phases and explicit disposal |
| Variable-time object updates and separate physics accumulation | Game-defined fixed tick with one physics phase                                |
| Automatic transform sharing and raw key messages               | Explicit public-state projection and validated intent commands                |
| Socket callbacks driving redraw                                | Frame loop, snapshot buffer and separate authoritative inbox                  |
| `onCollition`                                                  | `onCollision`                                                                 |
| Bun-specific scripts and browser-host relay                    | Node/pnpm, local mode and dedicated-room example                              |

There is no compatibility layer. The old test scene and rendering stack are removed instead of maintained alongside the replacement.

## Critical limits

Determinism is conditional on game code, complete state, identical content and a pinned physics build. Comparing only visible transforms is insufficient; the workshop fingerprint includes Rapier's serialized world. Unit goldens and Node/Chromium comparisons catch regressions but are not proof for every machine. CI expands the tested platform matrix.

Queue bounds have semantics, not just sizes. Dropping stale movement may be acceptable; dropping a purchase or dig is not. The command helper explicitly bounds held intent. Likewise, keeping every accepted snapshot avoids the old class of disappearing events, but durable exactly-once receipts require acknowledgements/resume semantics that are not implemented here.

Scene files are public content, including their seeds. No per-object flag can make a seed secret if the file itself is bundled into the browser. Privacy comes from server-only construction and explicit projection. This must be tested against the real game's mine-generation logic later.

The example predicts simple movement, not an interacting Rapier world. It uses a kinematic player that pushes boxes; it does not demonstrate collision-constrained first-person movement, multiplayer rollback, ropes in prediction or the game's full renderer/effects. Those TODOs remain open.

Resource disposal covers the ownership model used here, not every possible Three.js graph. Shared assets outside a collection and custom renderer resources need deliberate ownership. The room server is a development integration example, not a production security or scalability certification.

## Readiness for Definitely Safe (2026-09-23)

A read of the game against this engine found the fit better than the TODO suggests, because the two share their bones: the same `Rng` and `Hasher` algorithms, the same fixed tick and command-queue design, the same Rapier build, and the same pattern of a session carrying the company into each new level. Adoption should still begin with scene conversion.

What already fits: `Session` for contracts and the headquarters departure; `CommandQueue`, `TickInbox`, `Replica` and `Prediction` for the netcode, including the bounded queues and the idle-keeps-held-buttons semantics the game's reliability tests ask for; `PhysicsWorld` for the wagon, loose items, kinematic players and the rope joint; scene documents with one seeded site generator, since the maps are already plain data and every rotation is a yaw.

Added for it: `Rng.shuffle` and `Hasher.bool`, a setup payload in replays, an error instead of silent drops when a command queue overflows, and `RenderClock` plus bounded extrapolation in `src/interpolation.ts`.

Stays in the game: the renderer, asset baking, audio, HUD and the pointer-lock input module; the integer player controller, with Rapier only behind the wagon and loose items; the teleport cut, which is a per-entity view decision the generic `SnapshotBuffer` cannot make.

Found in the game: its sim seed reaches clients and, with the first dug cell, determines the mine layout. The mirror never places mines, so the seed can stop going out. Do that in the migration.

## Later Minesweeper migration gate

Begin with scene conversion only. Keep the game engine-independent until its generated maps and a fixed-seed headless run are unchanged. Then move fixed stepping/lifecycle, state projection and transport independently, keeping its existing tests and captures green after each step. Keep hidden mine-generation inputs server-side from the start.

Do not combine that migration with this review branch. No files in the Minesweeper checkout are changed by this work.
