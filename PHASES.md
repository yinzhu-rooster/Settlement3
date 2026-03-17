# Development Phases

---

## Phase 1a-i: Monorepo Scaffold + Board Rendering — GET HEXES ON SCREEN

Monorepo scaffold, board generation, and PixiJS rendering. Get hexes on screen ASAP.

- [ ] Monorepo setup (Turborepo + pnpm, 3 packages)
- [ ] `packages/shared`: `GameConfig` type with configurable rules (turn timer, friendly robber, speed mode, etc.)
- [ ] `packages/shared`: Board generation (hex grid, resources, number tokens, adjacency maps)
- [ ] `packages/client`: React + Vite app
- [ ] `packages/client`: PixiJS canvas rendering board with colored hexagons (no textures yet)

**Milestone: Board renders in the browser with colored hexagons.**

---

## Phase 1a-ii: Rules Engine + Tests

Pure rules engine with comprehensive test coverage.

- [ ] `packages/shared`: All game rules as pure functions (respecting `GameConfig` and building limits: 5 settlements, 4 cities, 15 roads)
- [ ] `packages/shared`: Turn state machine (setup phases + main phase)
- [ ] `packages/shared`: Unit tests for rules engine (Vitest — cover placement validation, building limits, resource production, robber/discard/mandatory steal, trade resolution including simultaneous accepts, dev cards, victory detection)

**Milestone: Rules engine is tested and correct.**

---

## Phase 1b: Playable Local Game

Full game loop playable in one browser tab (hot-seat, no networking).

- [ ] `packages/client`: `GameService` interface + `LocalGameService` implementation (wraps rules engine — all UI talks to this, not `useReducer` directly, to ease the Phase 2 multiplayer transition)
- [ ] `packages/client`: Click-to-place settlements and roads
- [ ] `packages/client`: Dice roll button + resource production
- [ ] `packages/client`: Resource display
- [ ] `packages/client`: Bank trade (4:1, 3:1, 2:1)
- [ ] `packages/client`: Player-to-player trade (offer, accept, reject, counter-offer, cancel)
- [ ] `packages/client`: Discard UI (when 7 rolled with >7 cards)
- [ ] `packages/client`: Dev card purchase and play
- [ ] `packages/client`: Victory detection
- [ ] `packages/client`: Toast/notification system for action errors (invalid placement, insufficient resources, wrong phase)
- [ ] `packages/client`: Undo action for local play (trivial with immutable state, improves solo testing)
- [ ] `packages/client`: Responsive layout from day one — pannable/zoomable PixiJS board, collapsible bottom sheet on mobile
- [ ] **Railway spike**: Deploy a bare Colyseus "hello world" to Railway to validate sticky sessions and WebSocket connectivity before building game logic on top. If Railway doesn't work, have fallback options: Fly.io, Render.
- **Turn timer is NOT implemented in this phase** (local play only). Turn timer implementation is deferred to Phase 3.
- **No server, no auth, no database** (Railway spike is infra validation only)

**Milestone: Play a complete game of Catan in your browser (desktop and mobile). Railway deployment is validated.**

---

## Phase 2: Multiplayer

- [ ] `packages/server`: Colyseus server setup
- [ ] `packages/server`: `CatanRoom` wrapping shared rules engine — broadcast full serialized game state via `room.broadcast()` instead of using Colyseus Schema (state is ~5-10KB, no need for binary delta sync)
- [ ] `packages/client`: `OnlineGameService` implementation (routes actions through Colyseus WebSocket, receives state broadcasts — swaps in for `LocalGameService`)
- [ ] Basic lobby: create game, join game by code
- [ ] Guest auth (pick a display name, session cookie)
- [ ] Periodic game state snapshots to Redis for crash recovery
- [ ] Deploy to Railway (Colyseus + static client + Redis)

**Milestone: Play with a friend in separate browsers.**

---

## Phase 3: Matchmaking & UX

- [ ] Colyseus `LobbyRoom` for game browser
- [ ] Quick match queue (3-4 players, auto-create game)
- [ ] Turn timer with auto-end-turn
- [ ] Reconnection handling (Colyseus `allowReconnection`)
- [ ] In-game chat (Colyseus messages)
- [ ] Sound effects (Howler.js)

**Milestone: Strangers can find each other and play.**

---

## Phase 4: Visual Polish

- [ ] AI-generated hex tile textures (Recraft/Scenario)
- [ ] AI-generated resource/building icons
- [ ] Animations: dice roll, resource collection, building placement, robber
- [ ] Loading screen with artwork
- [ ] Player color picker, avatar selection
- [ ] Game log (scrollable action history)

**Milestone: The game looks great.**

---

## Phase 5: Accounts & Persistence

- [ ] PostgreSQL setup with Drizzle ORM
- [ ] Better Auth integration (email/password + Google OAuth)
- [ ] Game history (store completed games)
- [ ] ELO rating system
- [ ] Leaderboard
- [ ] Player profiles

**Milestone: Players can sign up and track stats.**

---

## Phase 6: Advanced Features

- [ ] Spectator mode
- [ ] AI opponent (basic strategy bot for when a player leaves or solo play)
- [ ] Game replays
- [ ] Expansions (Seafarers map, 5-6 player extension)
- [ ] Premium cosmetics (if monetizing)

---

## Verification

- **Phase 1a-i**: Board renders in browser with colored hexagons.
- **Phase 1a-ii**: Run `pnpm test` — all rules engine tests pass.
- **Phase 1b**: Open browser, play full game — setup placement, dice rolls, resource production, building, bank trading, player trading, discard on 7, dev cards, longest road, victory at 10 VP. Test on mobile viewport (375px) — board should be pannable/zoomable, bottom sheet should collapse.
- **Phase 2**: Open two browser tabs, connect to same room, verify state sync, both players can act on their turn
- **Phase 3**: Open 4 tabs, use quick match, verify all join same game. Close a tab, reopen, verify reconnection

## Testing Strategy

- **Unit tests (Vitest)**: Rules engine in `packages/shared` — pure functions, easy to test. Cover every action type, edge cases (robber on 7, discard, dev card timing, longest road recalculation).
- **Integration tests**: Client-side game loop — dispatch actions through `useReducer`, assert UI state.
- **PixiJS interaction tests**: Integration tests for PixiJS interactions (click-to-place, vertex hit areas, hover states).
- **E2E tests (Playwright, Phase 2+)**: Full multiplayer flow — create room, join, play turns, verify sync.
