# SneakPeak engine

A small TypeScript engine core, with an optional Rapier physics adapter and Three.js browser helpers. Games own their rules, public-state projection, scene factories and transport protocol. The core does not import the example game, Three.js, Rapier, Node or a browser API.

This branch replaces the original prototype API. **Definitely Safe / Minesweeper has not been migrated or modified.** Read [REVIEW.md](REVIEW.md) for the decision, breaking changes and review order, and [TODO.md](TODO.md) for the remaining work.

## Run the workshop

Use Node 22.12+ and the pinned pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open <http://127.0.0.1:3000>:

- `/`: local fixed-tick physics, WASD movement and scene changes.
- `/?online`: create or join a password-protected room. Open two tabs to test multiplayer.
- `/?preview`: draw the scene without loading or stepping physics; bake the generator and download editable JSON.
- Add `&gl=webgl` (or `?gl=webgl`) to force the WebGL2 fallback. Otherwise the renderer probes an actual WebGPU device before using it.

The blue block is your player; pink blocks are other players. Players push dynamic boxes. This is a deliberately simple kinematic movement example, not a complete character controller.

`PORT` and `HOST` configure the development server. It binds to loopback by default. This server includes Vite development middleware: it is **not a production deployment**. The former browser-hosted relay mode is not supported; browser background throttling cannot be fixed by a different timer.

## Check the engine

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm demo:headless
pnpm exec playwright install chromium
pnpm test:browser
```

The browser check exercises local input, repeated scene changes and GPU disposal, physics-free preview, scene export, two-player rooms and scene travel. It also compares full Rapier snapshot fingerprints between Node and Chromium. Captures are written to ignored `evidence/browser/`. CI runs the unit/integration suite on Linux, Windows and macOS and browser checks on Linux.

`pnpm build` creates the library in `dist/` and the standalone client assets in `demo-dist/`. Those client assets need a compatible `/ws` server for online mode. `examples/counter.ts` is a second, physics-free headless simulation with record/replay verification.

## Library boundaries

| Entry point                 | Responsibility                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sneakpeak/engine`         | Scene data, schemas, seeded random streams, phases, entities, clocks, sessions, command queues, replication, prediction, interpolation and replay |
| `@sneakpeak/engine/physics` | Pinned deterministic Rapier build, explicit body/collider ownership and collision callbacks                                                       |
| `@sneakpeak/engine/browser` | Keyboard, pointer lock, renderer initialization and render-resource ownership; requires Three.js                                                  |

The package is private and is not published. Build it before consuming it as a local package. `game/`, `main.ts` and `server.ts` are an executable integration example, not part of the exported library. Rooms, authentication policy and wire messages belong there until a second game proves what should be shared.

### Scenes

`SceneRegistry` takes explicit named object and generator definitions. A `SceneDocument` is versioned JSON containing an id, scene-wide settings, and objects with stable ids, types and settings. A generator additionally has a seed. Schemas describe nested values, limits, optional fields, enums and units for a future editor.

```ts
import { SceneRegistry, meters, object } from '@sneakpeak/engine';

const registry = new SceneRegistry({
  wall: { sharing: 'local', settings: object({ width: { ...meters, min: 0.1 } }) },
});
const scene = registry.parse({
  version: 1,
  id: 'yard',
  settings: {},
  objects: [{ id: 'north-wall', type: 'wall', settings: { width: 12 } }],
});
const objects = registry.expand(scene);
const json = registry.serialize(scene);
```

`parse` validates authored data. `expand` also runs and validates generators; child ids are namespaced as `generator-id/child-id`. `bake(scene, id)` replaces one generator with its ordinary objects without changing expanded ids, order or settings. Generators are trusted game code, must be pure apart from the supplied random stream, and must not depend on registration order, wall time or `Math.random()`.

The workshop builds physics and visuals from the same expanded settings, in meters. Gravity, background and ordinary spawn objects are scene data. A scene's `sharing` declaration is metadata, **not an automatic security boundary**. The game must keep server-only objects out of its rendering and public-state projection. Anything in a client-loaded scene, including a generator seed, is public. Secret mine placement must never use a public seed.

### Simulation and lifetime

`Simulation` runs named phases in the supplied order. `Entities` runs object behavior in lexical id order, skips objects removed or replaced during the tick and postpones newly spawned objects until the next update. Runtime ids are counted per collection. Use authored ids when order must be independent of creation order.

`FixedClock` consumes elapsed milliseconds and returns an interpolation fraction. It caps catch-up work and deliberately drops excess stall time. `scheduleTicks` uses a monotonic, self-correcting timer; it does not promise real-time throughput under overload. A game explicitly places exactly one `PhysicsWorld.step()` in each simulation tick.

`Session` owns persistent game state and the current level. A scene change constructs the replacement before disposing the old level and increments the epoch. The factory must clean up partial construction if it throws; it must not mutate persistent state until construction succeeds. A failing old-level disposer does not roll back the new level.

Call `initPhysics()` before constructing a physics world. `PhysicsWorld.add()` can create a body with several colliders or collider-only geometry. Collision callbacks use `onCollision`. Queries, joints and character controllers are available through `.world` and `RAPIER`, without duplicating Rapier's API. Remove managed objects through the adapter so its ownership maps remain correct; do not free the underlying world yourself. Removing objects inside collision callbacks is supported; recursive stepping or disposing the world during a step is rejected.

`RenderObjects` owns added trees and their geometries, materials and directly referenced textures. It preserves resources shared by other trees in the same collection, then frees them when the final owner disappears. Do not share these assets across independently disposed collections. Custom shader uniforms, node graphs, render targets and externally cached assets need their own explicit ownership. `disposeObject` is for an exclusively owned tree. Dispose input listeners, sessions, physics and rendering on shutdown.

### Networking contracts

`CommandQueue` expects increasing positive sequence numbers over an ordered connection. Duplicate/older commands are rejected. It consumes at most one queued command per tick; on overflow it drops the oldest queued commands to bound latency. `applied` is the last consumed sequence, not a promise that every lower sequence ran. When configured to repeat, it repeats the last command for a bounded number of ticks, then calls the game's idle policy. **Use repetition only for held intent, not one-shot actions** such as buying, firing or digging. A game with those actions must disable repetition or use a separate action policy.

`Replicator` accepts only a caller-projected public JSON object. It sends changed top-level entries and removals, not a recursive field or tile diff. Large blocks are supported but a changed block is resent in full; the game chooses useful chunk boundaries. Each connection needs its own replicator. Full baselines and revision numbers make missing deltas detectable. `Replica` requires an ordered stream; reconnect and reset the baseline after a gap.

`TickInbox` preserves every accepted tick, including changes and events, and deduplicates by `(epoch, tick)`. It throws on overflow rather than silently discarding events. The workshop disconnects slow clients and requires a fresh join; it does not resume an interrupted event stream. Ordered WebSocket delivery is not a durable exactly-once event guarantee. Events are consumed with the authoritative snapshot, not delayed until the interpolated visual time; an effect timeline remains to be implemented.

`Prediction` replays unacknowledged commands over an authoritative correction using a game-supplied deterministic function. It is not rollback for an entire interacting physics world. `SnapshotBuffer` interpolates remote states and holds the latest state when updates stop. The workshop demonstrates correction smoothing and a small adaptive render delay; it has not been tuned against a real-world latency/loss matrix.

The example checks protocol version and expanded scene-content fingerprints at join, validates all client messages, limits payloads and message rates, bounds send/command queues, pings dead peers, and expires empty rooms. Passwords and room state are in memory. Public deployment still needs TLS, connection/IP admission limits, authentication policy, operational limits and monitoring. Never expose the development server as a hardened service.

### Determinism and replay

Rapier is pinned to `@dimforge/rapier3d-deterministic-compat@0.20.0`. Seeded `Rng` uses xoshiro128**; seeds are reduced to 32 bits, restored states must be nonzero uint32 tuples, and integer sampling uses modulo (not cryptographic or perfectly unbiased randomness).

`Hasher` is a 32-bit diagnostic fingerprint, not a security hash. Include every future-affecting value: game state, random streams, tick counters, pending operations and physics. The workshop hashes its tick, public state and **the full Rapier world snapshot**, rather than only visible transforms. Hashes are meaningful only for the same game code, content, tick rate and pinned physics build. A local Node/Chromium check and CI goldens provide evidence, not a universal determinism guarantee.

`Recorder` stores commands and post-tick hashes with build and scene identities. `verifyReplay` constructs a fresh simulation, reports the first divergent zero-based tick and always disposes it. Games own complete command serialization and initial-state identity. This is replay-from-start verification, not a save-game format or arbitrary snapshot restoration API.
