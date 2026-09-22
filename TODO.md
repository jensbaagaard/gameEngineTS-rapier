# Engine TODO

The goal remains to support Definitely Safe without moving its rules into the engine, then build a level editor on shared scene data.

This branch updates **only the engine repository**. Checked items are implemented and tested in the core or workshop example; they do not claim that Definitely Safe has been migrated. Open items are intentionally not hidden behind the demo. See [README.md](README.md) for API limits and [REVIEW.md](REVIEW.md) for the rebuild decision.

## Scene data and editor foundation

- [x] Load, validate, edit and save versioned scene data without running a simulation.
- [x] Give scene objects stable ids and settings, in meters where appropriate.
- [x] Use the same scene settings for physics and visuals; static level content is not sent every tick.
- [x] Carry scene-wide settings such as gravity and background; schemas can describe lighting, fog and playable areas.
- [x] Register named object types explicitly, without import-order side effects.
- [x] Describe nested settings, units, optional fields, enums and validation limits.
- [x] Declare local, replicated or server-only sharing as type metadata.
- [ ] Build the editor's property controls from those schemas and enforce sharing policy in its preview.
- [x] Preview the workshop without loading physics or starting simulation.
- [x] Treat spawn points as ordinary objects; leave player-join rules to the game.
- [x] Mix authored objects and seeded generators; validate generated ids and settings.
- [x] Bake generators into editable objects without changing their expanded ids or settings.
- [ ] Port Definitely Safe's site generators and layout constraints; prove unchanged maps with its existing fingerprints. Deferred with game integration.

## Scene transitions

- [x] Separate session state from level state and dispose old levels on replacement.
- [x] Switch workshop scenes without disconnecting players, retaining their slots and a persistent counter.
- [x] Reset prediction/history and send a full replication baseline on an epoch change.
- [x] Reject a client whose expanded scene data disagrees with the server.
- [ ] Add scheduled scene activation for games that require every client to change at the same presentation tick. The example changes when the authoritative snapshot is received.

## Simulation and determinism

- [x] Advance fixed ticks; the physics example steps Rapier exactly once per tick.
- [x] Replace interval drift with a monotonic scheduler and bounded catch-up.
- [ ] Measure sustained tick rate under Windows/macOS/Linux load. No timer can guarantee throughput on an overloaded or suspended host.
- [x] Run named orchestration phases in an explicit order and per-object behavior in stable id order.
- [x] Count runtime ids per collection and skip objects removed or replaced during the current tick.
- [x] Seed and restore random streams.
- [x] Record commands and verify replay fingerprints with build/scene identity checks.
- [x] Include complete physics snapshots in the workshop fingerprint.
- [x] Compare identical physics command streams in Node and Chromium; keep a fixed regression fingerprint.
- [ ] Establish the supported cross-platform determinism envelope. CI covers three desktop OSes, but browser/CPU/backend coverage is not universal and game code must also be deterministic.

## Physics

- [x] Support multiple colliders per body and collider-only objects.
- [x] Expose Rapier joints, queries and kinematic bodies without duplicating its API.
- [x] Use correctly spelled `onCollision`; handle removal during callbacks and reject unsafe reentrancy.
- [x] Regress removal of both collider-only and fixed-body floors while a dynamic body rests on them, using pinned Rapier 0.20.0.
- [ ] Reproduce the original static-removal crash with its exact scene if it differs from these cases. The tested path now passes; this is not a claim to have fixed every upstream Rapier case.
- [ ] Prove collision-constrained player movement with the game's controller. Workshop movement pushes boxes but is not a full character controller.

## Networking

- [x] Send bounded, validated player intent instead of raw keyboard state.
- [x] Consume increasing commands, acknowledge consumed sequences and reject duplicates/stale epochs.
- [x] Bound backlog and repeat held input briefly before idling; overflow drops oldest commands explicitly.
- [ ] Specify a lossless action channel for commands that must not be dropped or repeated. The held-movement queue is not exactly-once gameplay action delivery.
- [x] Predict local movement and reconcile unacknowledged commands with smoothed visual corrections.
- [x] Render every browser frame, interpolate fixed ticks and buffer remote snapshots.
- [ ] Test/tune render delay and correction under realistic jitter, latency and bandwidth limits.
- [x] Replicate arbitrary public JSON entries and removals; send only changed top-level entries.
- [x] Allow one state entry to contain a large block instead of an object per tile.
- [x] Require explicit public-state projection so objects and individual private fields can be omitted.
- [ ] Prove the game's privacy boundary during integration, including hidden placement seeds and future-affecting state.
- [x] Preserve accepted snapshot events and state changes through local buffering; detect missing delta baselines and overflow.
- [ ] Provide durable event ids, acknowledgements and reconnect/resume semantics if exactly-once effects or receipts are required.
- [ ] Schedule events against the interpolated presentation timeline.
- [ ] Add a small client-only effects example, including optional collision, without importing physics into effects that do not need it.

## Server example and hosting

- [x] Run independent password-protected rooms with stable slots and empty-room cleanup.
- [x] Reject repeat joins, unknown message types, malformed input and mismatched builds/content without accidentally despawning the player.
- [x] Limit payloads, messages, room/player counts and outbound backlog; clean up dead connections and server timers.
- [ ] Add production admission control, deployment configuration and load tests before exposing a public service.
- [ ] Revisit browser hosting only with an explicit suspension/authority-handoff design. The old relay mode has been removed; background tabs cannot guarantee a running authoritative simulation.

## Browser and rendering

- [x] Use physical keyboard codes, handle Shift/release and clear held input on blur/hidden pages.
- [x] Leave text fields editable and dispose input listeners.
- [x] Expose mouse deltas/buttons and pointer-lock request/release.
- [x] Free scene geometry/material/direct texture resources, including sharing within a render collection.
- [x] Check actual WebGPU device availability and use WebGL2 when unavailable; support forcing WebGL2.
- [ ] Validate native WebGPU, pointer lock, GPU failure paths and touch/browser compatibility across target devices.
- [ ] Port and visually compare Definitely Safe's renderer, effects and complete resource graph. A lit-box demo does not establish renderer parity.

## Packaging and game migration

- [x] Build and test with Node; separate runtime-neutral core, physics and browser entry points.
- [x] Demonstrate a second, physics-free simulation with replay verification.
- [ ] Stabilize/publish the package only after a real consumer tests the API.
- [ ] Move Definitely Safe over in a separate change, preserving its tests, headless fingerprints and visual captures at every step. **Explicitly deferred.**
