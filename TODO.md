# TODO

## Client-side effects

Visual effects, such as particles, should only be simulated on each player's own machine. They are purely cosmetic, so the server shouldn't spend time on them or send them to every player.

- [ ] The game can trigger an effect, and every player sees it.
- [ ] Effects animate smoothly, regardless of network timing.
- [ ] Effects can collide with the level, but only when an effect needs it. Most don't, and it makes the game heavier to load.
