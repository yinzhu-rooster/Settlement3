# CLAUDE.md — Settlement3

Catan clone, 4th attempt. UI/UX quality is paramount — never cut corners on interactions, animations, or visual polish.

## Project Overview

Monorepo with three packages:

- `packages/shared/` — Pure TS game engine. Types, board generation, rules. **Zero external dependencies.**
- `packages/server/` — Colyseus game server (Node.js). Authoritative state.
- `packages/client/` — React 19 + PixiJS v8 frontend.

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm |
| Frontend | React 19, Vite |
| Board rendering | PixiJS v8, @pixi/react |
| UI chrome | Tailwind CSS v4, Radix UI |
| Backend | Node.js, Colyseus |
| Database | PostgreSQL, Drizzle ORM |
| Cache | Redis |
| Testing | Vitest |
| Deploy | Railway |

## Architecture Rules

1. **All game logic lives in `packages/shared`.** Never put rules, validation, or state transitions in client or server.
2. **`packages/shared` has ZERO external dependencies.** Pure TypeScript only. No lodash, no immer, nothing.
3. **Rules engine is pure functions:** `(state, action) => newState | Error`. Prefer immutable state updates — return new objects, don't mutate.
4. **Authoritative server.** Server validates all actions through the shared rules engine, then broadcasts full serialized state via `room.broadcast()`. No Colyseus Schema — plain JSON.
5. **GameService interface** abstracts local vs online play. Client code talks to `GameService`, never directly to game state or Colyseus rooms.
6. **PixiJS for the board only.** All UI chrome (menus, dialogs, HUD, trade panels) uses React + Radix UI + Tailwind. Don't render HTML UI in the PixiJS canvas.
7. **Standard Catan rules by default**, configurable via `GameConfig`.

## Commands

```bash
pnpm install              # Install all deps
pnpm dev                  # Run all packages in dev mode (turborepo)
pnpm build                # Build all packages
pnpm test                 # Run all tests (vitest)
pnpm test --filter=shared # Test a specific package
pnpm lint                 # Lint all packages
```

## Code Conventions

- **Package manager:** pnpm only. Never use npm or yarn.
- **Imports between packages:** Use workspace protocol (`@settlement3/shared`, etc.).
- **Tests colocated with source:** `rules.ts` → `rules.test.ts` in the same directory.
- **File naming:** kebab-case for files, PascalCase for React components.
- **State updates in rules engine:** Always return new state objects. No mutation.
- **Error handling in rules:** Return typed errors from action handlers, don't throw.
- **React components:** Functional components only. Keep PixiJS components in a `canvas/` directory, Radix-based UI in a `ui/` directory.

## Testing

- Use **Vitest** for everything.
- Test files live next to their source: `board-generator.ts` → `board-generator.test.ts`.
- Rules engine tests: provide an initial state, apply an action, assert on the resulting state.
- Snapshot tests are fine for board generation layouts.
- No mocking the rules engine — it's pure functions, test it directly.

## Common Patterns

### Adding a new game action

1. Define the action type in `packages/shared/src/types/actions.ts`.
2. Write the handler as a pure function in `packages/shared/src/rules/`.
3. Write tests next to the handler.
4. Register the handler in the action dispatcher.
5. Server already validates and broadcasts — no server changes needed unless it's a new message type.

### Adding UI for a game action

1. Create a React component using Radix UI primitives + Tailwind for styling.
2. Call `gameService.dispatch(action)` — never modify state directly.
3. Read state from the GameService's state subscription.

### Board rendering

1. PixiJS components live in `packages/client/src/canvas/`.
2. Use `@pixi/react` for declarative rendering.
3. Board data comes from shared package's board generator.
4. Interactions (click hex, place settlement) emit events that go through GameService.

## UI/UX Priorities

This is the 4th attempt at this project. UI/UX quality is the top priority:

- Smooth animations for all state transitions (dice rolls, resource distribution, building placement).
- Clear visual feedback for valid/invalid placements.
- Responsive — works on desktop and tablet.
- Accessible — Radix UI handles focus management and keyboard nav for all dialogs and menus.
- Polish the details: hover states, transitions, loading states, error states.
