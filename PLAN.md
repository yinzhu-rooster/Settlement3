# Settlement3 — Architecture Plan

Online Settlers of Catan clone. 4th attempt — this plan prioritizes **a playable game loop in Week 1**, then layers multiplayer, polish, and scale on top.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **Turborepo + pnpm** | Fast builds, shared TS types, simple setup |
| Frontend | **React 19 + Vite** | Largest ecosystem, best PixiJS integration |
| Board rendering | **PixiJS v8 + @pixi/react** | Lightweight GPU renderer (not Phaser — too heavy for a board game) |
| UI chrome | **Tailwind CSS v4 + Radix UI** | Headless accessible components, fast styling |
| Backend | **Node.js + Colyseus** | Purpose-built multiplayer game server with built-in state sync, matchmaking, reconnection |
| Database | **PostgreSQL + Drizzle ORM** | Relational data (users, ELO, game history) |
| Cache/sessions | **Redis** | Session store, matchmaking queues, Colyseus presence |
| Auth | **Guest accounts first**, Better Auth later | Zero friction to start playing |
| Deployment | **Railway** | Simplest path for stateful WebSocket server + DB + Redis |

## Monorepo Structure

```
settlement3/
  packages/
    shared/     # Pure TS game engine — types, board gen, rules (zero deps)
    server/     # Colyseus game server
    client/     # React + PixiJS frontend
  turbo.json
  package.json
  pnpm-workspace.yaml
```

## Architecture

```
Browser (React + PixiJS)
    |  WebSocket (Colyseus client SDK)
Colyseus Server (Node.js)
    |-- Game Rooms (authoritative state, auto-synced to clients)
    |-- Lobby Room (matchmaking, game browser)
    |-- Redis (presence, sessions)
    |-- PostgreSQL (users, completed games, stats)
```

### Key Design Decisions

- **Authoritative server**: Client sends actions, server validates with rules engine, state syncs to clients
- **Skip Colyseus Schema**: Instead of duplicating types into `@colyseus/schema` decorated classes, broadcast serialized snapshots of `packages/shared` types via `room.broadcast()`. For a 4-player board game the state is small enough (~5-10KB) that full-state broadcasts are fine — no need for binary delta sync. This eliminates the Schema duplication problem entirely.
- **No client-side prediction needed** — turn-based game, 50-200ms latency is imperceptible
- **Game state in-memory** during play — only persist completed games to PostgreSQL
- **Shared rules engine** (`packages/shared`) runs on both server and client (for local validation/preview)
- **GameService abstraction**: The client interacts with game state through a `GameService` interface, not directly through `useReducer`. In Phase 1b, `LocalGameService` implements this interface synchronously. In Phase 2, `OnlineGameService` swaps in and routes actions through the Colyseus WebSocket. This avoids rewriting all UI code during the multiplayer transition.

```typescript
// packages/client/src/services/GameService.ts
interface GameService {
  dispatch(action: GameAction): void;
  subscribe(listener: (state: GameState) => void): () => void;
  getState(): GameState;
}
```

> **Error handling**: `dispatch` should surface action rejection feedback. Options: return an error string/object, or include a `lastError` field in `GameState` that the UI can subscribe to for toast notifications.

### Known Concerns

- **Crash recovery**: In-memory game state is lost if the server crashes. Periodic game state snapshots to Redis are implemented in Phase 2 to enable crash recovery on server restart.
- **Railway sticky sessions**: Colyseus requires sticky sessions for WebSocket connections. Railway supports this but needs careful configuration. Spike a bare Colyseus "hello world" on Railway during Phase 1b to validate before building game logic on top. Fallback options: Fly.io, Render.

### Matchmaking

- **Quick Match**: Join queue → Colyseus auto-creates room when 3-4 players ready
- **Custom Game**: Create room with code (e.g., "BRICK"), friends join with code
- **Lobby Room**: Colyseus built-in `LobbyRoom` broadcasts open games

### Reconnection

- Colyseus `allowReconnection(client, 120)` — reserves seat for 2 minutes
- Reconnection token in `sessionStorage` so page refresh works

## Critical Files

| File | Purpose |
|---|---|
| `packages/shared/src/types.ts` | All shared TypeScript types + `GameConfig` |
| `packages/shared/src/board.ts` | Hex grid generation, adjacency maps |
| `packages/shared/src/rules.ts` | Pure game rules engine |
| `packages/client/src/services/GameService.ts` | Interface + `LocalGameService` (Phase 1b) and `OnlineGameService` (Phase 2) |
| `packages/server/src/CatanRoom.ts` | Colyseus room wrapping rules engine, broadcasts full state |
| `packages/client/src/components/BoardRenderer.tsx` | PixiJS board rendering + interactions |
| `packages/client/src/components/Toast.tsx` | Action error feedback (invalid placement, insufficient resources, wrong phase) |
