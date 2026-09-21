# gameEngineTS

```bash
bun install
```

## Dedicated server

Runs the simulation on the server. Players connect and the game outlives any of them.

```bash
bun start
```

Open http://localhost:3000

## Hosted by a player

The server only relays. One player opens `/?host` and runs the simulation in their browser; everyone else opens `/`. No ports to open.

```bash
bun relay
```

## Single player

Any server, or just `bun index.html`, then open `/?local`.
