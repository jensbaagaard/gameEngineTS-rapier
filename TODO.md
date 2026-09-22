# TODO

## Client-side effects

Visual effects, such as particles, should only be simulated on each player's own machine. They are purely cosmetic, so the server shouldn't spend time on them or send them to every player.

- [ ] The game can trigger an effect, and every player sees it.
- [ ] Effects animate smoothly, regardless of network timing.
- [ ] Effects can collide with the level, but only when an effect needs it. Most don't, and it makes the game heavier to load.

## Crash when destroying static objects

Destroying a static object, such as the ground, while something is touching it crashes the simulation. The bug is in Rapier itself (0.20.0, the latest version). The game doesn't do this today, but destructible walls or platforms would.

- [ ] Static objects can be destroyed while something touches them, without crashing.
