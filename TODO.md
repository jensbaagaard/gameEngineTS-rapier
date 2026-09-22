# TODO

Most of this list is what the engine is missing before Definitely Safe (our mine-sweeper game) can move onto it. We want the game on the engine so we can build tooling, starting with a level editor, on one standard way of describing scenes.

Scenes come first. The level editor needs nothing else, and the scene work can be proven against the game before anything else moves. Most of the simulation and networking pieces already exist, with tests, inside Definitely Safe.

## Scenes and the level editor

### Scenes as data

A scene is code today, so a tool can't read or write it. Scenes should be data files that the server, every player's client and the level editor all load the same way. Then the editor and the game always agree on what a level contains.

- [ ] A scene can be loaded, edited and saved without running the game.
- [ ] The server and every client build the level from the same scene file, so level content is never sent over the network. Today it would be: one Definitely Safe site has about 250 obstacles that never move, and they would be re-sent 60 times a second for as long as the game runs.
- [ ] Each object in a scene keeps a stable id, so saving a scene doesn't reshuffle it and other things can refer to it.
- [ ] Scenes are written in meters, whatever units the simulation uses internally.
- [ ] Scenes hold scene-wide settings beyond gravity, such as the playable area, lighting and fog.

### Object settings

An object placed in a scene can only be given a position today. Definitely Safe's levels also need sizes, rotations, variants, fence lengths, water outlines, minefield dimensions and more.

- [ ] Every object in a scene can carry its own settings.
- [ ] Each setting, such as a size, is written once, and both the physics and the visuals use it. Today the ground's size is written twice, and the two copies can drift apart.
- [ ] An object's visuals can read its settings, so a fence is drawn at the length it was placed with.
- [ ] The editor can draw a scene without running the simulation.

### Object types

The editor needs to know which kinds of objects exist and what settings each one takes.

- [ ] Every kind of object is registered under a name, with a description of its settings.
- [ ] The editor uses that description to show an object's settings and to reject invalid values.
- [ ] Each kind of object says how it's shared over the network: built locally on every machine, kept in sync by the server, or kept on the server only.
- [ ] Registering object types doesn't depend on the order files are loaded in. Definitely Safe's own version of this broke that way.

### Spawn points

Where players appear is a single special-case position today. Definitely Safe seats players in slots that fan out from a point, and puts them back in the same slots after a scene change.

- [ ] Spawn points are ordinary objects placed in a scene.
- [ ] The game, not the engine, decides what happens when a player joins.

### Hand-made and generated content

Every Definitely Safe map is generated from a site and a random seed, and the level editor is for making levels by hand. Both have to work, side by side. Levels made only by hand would lose the game's variety, and placing hundreds of trees by hand is tedious anyway.

- [ ] A scene can be made entirely by hand, generated entirely from a seed, or mix both.
- [ ] A scene can contain generators, such as a wall of trees, alongside objects placed by hand.
- [ ] A generator gives the same result every time for the same seed.
- [ ] The editor can turn a generator into ordinary objects so they can be edited by hand.
- [ ] The game's existing layout rules, such as keeping clear space around the minefield, become checks the editor runs.

### Moving between scenes

Definitely Safe moves its players from headquarters to a site and back. Money, equipment, stats and the contract number carry across, and everyone keeps their slot. The engine has one scene, fixed when it starts.

- [ ] The game can switch scenes while players stay connected.
- [ ] State that belongs to the team rather than to a level survives a scene change.
- [ ] Every client clears the old scene and loads the new one at the same point in the game.

### Proving the scene system

- [ ] Definitely Safe's existing maps, rebuilt as scene files, play out exactly as they do today. The game's headless run with a fixed seed produces the same state fingerprint as before.

## Simulation

### Fixed tick

The simulation advances by however much real time has passed, so its results depend on the machine and on timing. Its clock also drifts: Definitely Safe measured 21 ticks a second instead of 30 on Windows with the same kind of timer, and replaced it.

- [ ] The simulation advances in fixed steps, with exactly one physics step per tick.
- [ ] The tick rate holds steady on every platform.

### Determinism

The engine guarantees determinism: the same inputs give the same result on every machine. Definitely Safe's tests, replays and client prediction all rely on it, and so will any game we build later.

- [ ] The same inputs produce the same simulation on every machine and platform, physics included.
- [ ] Randomness comes from a seed, so it can be replayed.
- [ ] Object ids are counted per simulation, not across the whole server, so games running side by side don't affect each other.
- [ ] The simulation's state can be summarized as a fingerprint, to spot two machines drifting apart.
- [ ] A game session can be recorded and replayed exactly.

### Game objects and orchestrators

Game logic lives in two places. Game objects handle their own simple behavior. Orchestrators handle logic that spans many objects at once, such as Definitely Safe's tick, which makes several passes over all players in a set order. Today, logic can only run as one update per object, in the order objects were created, so the order changes whenever someone joins.

- [ ] Game objects can have their own logic, as they do today.
- [ ] Orchestrators can run logic across every object of a kind at once.
- [ ] Game logic runs in named phases, in a fixed order.
- [ ] The order doesn't depend on when objects were created.
- [ ] An object destroyed during a tick doesn't update later in that tick. Today it does, after its physics is already gone.

### Physics features

- [ ] An object can have several colliders on one body.
- [ ] Objects can be joined together, such as by a rope.
- [ ] Game logic can move players directly while they still collide with the world.
- [ ] Game logic can query the world, such as casting a ray to see what a player is aiming at.
- [ ] Objects can have only a collider and no body. This is done on the `collider-only-gameobjects` branch and needs merging. Most of a Definitely Safe site is obstacles like this.

### Crash when destroying static objects

Destroying a static object, such as the ground, while something is touching it crashes the simulation. The bug is in Rapier itself (0.20.0, the latest version). The game doesn't do this today, but destructible walls or platforms would.

- [ ] Static objects can be destroyed while something touches them, without crashing.

## Networking

### Player commands

Clients send raw key presses today. Definitely Safe sends one command per player per tick describing what the player wants to do, and its prediction and replays are built on that.

- [ ] Each tick, a client sends one command describing the player's intent.
- [ ] The server applies each player's commands in order, exactly once, and tells the client which ones it has applied.
- [ ] Commands that arrive late, early or out of order are handled predictably.

### Responsive movement

Your own movement waits for a full round trip to the server today.

- [ ] Your own player responds to input immediately.
- [ ] When the server disagrees, your player is corrected smoothly instead of snapping.

### Smooth rendering

The screen only redraws when a snapshot arrives, so movement is exactly as choppy as the network.

- [ ] The screen redraws every frame, independent of the network.
- [ ] Movement is smoothed between ticks.
- [ ] Other players move smoothly through network jitter.
- [ ] The client stays in step with the server as network conditions change.

### Game state

Only positions and rotations reach the clients today. A Definitely Safe player has about 35 other things clients need to see, and there's also the minefield, the ledger and the team's money.

- [ ] Any object can share its game state with clients, not just where it is.
- [ ] Only state that changed is sent.
- [ ] One object can own a large block of state, such as the whole minefield, instead of it being split into an object per tile.

### Secrets

Everything is sent to every client today, so anyone watching the network traffic could see where the mines are.

- [ ] Some state never leaves the server, such as the mine layout.
- [ ] Part of an object's state can be hidden while the rest is shared, such as which plates in the field are live.

### Game events

Definitely Safe has about 25 kinds of one-off events, such as explosions, that drive its sounds, effects and receipts. They happen once, so they don't fit as state. Client-side effects are one of their uses.

- [ ] The game can send an event that players receive exactly once.
- [ ] Events stay in step with the state they belong to, so a sound plays when its explosion is seen.

### Client-side effects

Visual effects, such as particles, should only be simulated on each player's own machine. They are purely cosmetic, so the server shouldn't spend time on them or send them to every player.

- [ ] The game can trigger an effect, and every player sees it.
- [ ] Effects animate smoothly, regardless of network timing.
- [ ] Effects can collide with the level, but only when an effect needs it. Most don't, and it makes the game heavier to load.

### Rooms

The server runs a single game for everyone. Definitely Safe runs separate rooms that players create and join.

- [ ] One server runs many independent games.
- [ ] A room can have a password.
- [ ] Rooms that are no longer used get cleaned up.

### Hosting from a browser

Host mode runs the simulation in a browser tab. Browsers slow background tabs to about one update a second, so when the host switches tabs, everyone's game freezes.

- [ ] A game hosted from a browser keeps running when the host's tab is in the background.

### Untrusted clients

The server trusts whatever clients send.

- [ ] A client can join only once per connection. Today it can spawn as many players as it likes.
- [ ] Unknown or malformed messages are rejected. Today any unrecognized message quietly removes the player, while they stay connected.
- [ ] A client can't flood the server with messages.

## Input

### Keyboard

- [ ] Keys never get stuck. Today, holding D, pressing Shift and then releasing D leaves D held forever. The same happens to any key held when the window loses focus.
- [ ] Controls work the same on every keyboard layout.
- [ ] Text fields accept typing. Today the engine swallows every key press, so the game's name, room and password fields wouldn't work.

### Mouse

- [ ] The game can read the mouse and lock the pointer for aiming.

## Rendering

### Freeing resources

- [ ] Removing an object or changing scenes frees its GPU memory. Today nothing is freed, so every scene change would leak memory.

### Matching the game's renderer

Definitely Safe uses a newer rendering backend where the browser supports it and falls back where it doesn't. It also checks that the GPU actually works before starting, because some browsers report support they don't have.

- [ ] The engine renders everything the game's renderer does today, on the same range of browsers.

## Platform

### Running on Node

The engine runs on Node, the same as Definitely Safe. The game is already built, tested and deployed on Node, so its pieces can move into the engine with their tests unchanged. The engine only runs on Bun today.

- [ ] The engine's server, client and tests run on Node.
- [ ] The engine's core doesn't depend on a particular runtime, so switching later stays a small change.

### Public API

- [ ] The collision callback's name, `onCollition`, is spelled correctly. Renaming it is cheap now and expensive once a whole game uses it.

## Moving the game over

- [ ] Definitely Safe runs on the engine. It moves over piece by piece, with its tests, headless fingerprint and end-to-end captures passing at every step.
