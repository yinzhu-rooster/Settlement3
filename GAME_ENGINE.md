# Game Engine — `packages/shared`

Pure TypeScript game rules engine with zero dependencies on Colyseus, React, or PixiJS. Shared between server and client.

---

## Board (Hex Grid, Axial Coordinates)

- 19 hexes: 4 wood, 4 wheat, 4 sheep, 3 brick, 3 ore, 1 desert
- Number tokens 2-12 (no 6/8 adjacent)
- 54 vertices (settlements/cities), 72 edges (roads), 9 ports
- Pure functions: `generateBoard()`, adjacency maps for hexes/vertices/edges

### Data Structures

```typescript
interface HexTile {
  q: number; r: number;           // axial coords
  resource: Resource | 'desert';
  numberToken: number | null;     // 2-12, null for desert
  hasRobber: boolean;
}

interface Vertex {
  id: string;                     // derived from adjacent hex coords
  building: 'settlement' | 'city' | null;
  owner: number | null;
}

interface Edge {
  id: string;
  road: boolean;
  owner: number | null;
}
```

### Board Generation Algorithm

1. Place hex tiles in standard spiral pattern
2. Shuffle resource types
3. Place number tokens using standard spiral sequence (no 6/8 adjacency)
4. Assign ports to predefined coastal positions
5. Generate vertex and edge adjacency maps from hex positions

---

## Rules Engine — `(state, action) => newState | error`

### Game Configuration

The rules engine accepts a `GameConfig` parameter at game creation, allowing configurable rules:

```typescript
interface GameConfig {
  maxPlayers: 3 | 4;              // default: 4
  turnTimerSeconds: number;        // default: 90, 0 = no timer
  friendlyRobber: boolean;         // default: false — if true, robber can't target players with ≤2 VP
  speedMode: boolean;              // default: false — if true, start with extra resources
  discardThreshold: number;        // default: 7 — discard when holding more than this
}
```

All rules functions receive `GameConfig` so behavior can vary. Default config matches standard Catan rules.

### Building Limits

Each player has hard limits on pieces, matching the physical board game:

| Piece | Max per player |
|---|---|
| Settlement | 5 |
| City | 4 |
| Road | 15 |

Placement actions must validate against these limits. When all 5 settlements are placed, a player must upgrade to a city before placing more (upgrading returns the settlement to their supply).

### Actions

- `ROLL_DICE` — produces resources for all players on matching hexes, triggers robber on 7
- `PLACE_SETTLEMENT` — validates vertex is empty, adjacent to own road (except initial placement), not adjacent to another settlement, player has resources, player has settlements remaining in supply
- `PLACE_CITY` — validates existing settlement at vertex, player has resources, player has cities remaining in supply. Returns settlement to supply.
- `PLACE_ROAD` — validates edge is empty, adjacent to own settlement/road, player has resources, player has roads remaining in supply
- `BUY_DEV_CARD` — validates resources, draws from shuffled deck
- `PLAY_DEV_CARD` — knight (move robber + steal), year of plenty, monopoly, road building
- `MOVE_ROBBER` — place on new hex, steal from adjacent player (see Robber rules below)
- `TRADE_OFFER` — propose trade to specific player or all. Each offer gets a unique ID.
- `TRADE_ACCEPT` / `TRADE_REJECT`
- `TRADE_COUNTER` — recipient proposes modified terms back to the initiator (pre-fills a new offer with swapped resources)
- `TRADE_CANCEL` — initiator withdraws their offer before it is accepted
- `BANK_TRADE` — 4:1 default, 3:1 with generic port, 2:1 with specialty port
- `UNDO` — restores previous game state, only available in local play mode
- `END_TURN`

### Turn Management

```
SETUP_PHASE_1:  Players place 1 settlement + 1 road (in order: P1, P2, P3, P4)
SETUP_PHASE_2:  Players place 1 settlement + 1 road (reverse: P4, P3, P2, P1)
                When the second settlement is placed, the rules engine automatically
                collects initial resources from all adjacent hexes (implicit, not a
                separate player action).
MAIN_PHASE:     Loop: roll dice -> trade/build -> end turn
```

Each turn has a timer (configurable, default 90 seconds). If time expires, turn auto-ends.

#### Rolling a 7 — Discard & Robber

When a 7 is rolled, the turn enters a sub-state before the active player moves the robber:

1. **Discard**: Every player with >7 resource cards must discard half (rounded down). All discards happen simultaneously before the robber moves.
2. **Move robber**: Active player places the robber on a new hex (cannot stay on current hex).
3. **Steal**: Active player steals 1 random resource from any player with a settlement/city on that hex.

### Dev Card Rules

- **Deck composition**: 14 Knight, 5 Victory Point, 2 Road Building, 2 Year of Plenty, 2 Monopoly (25 total)
- **Timing**: A dev card bought this turn cannot be played this turn. Exception: VP cards are revealed (not "played") and take effect immediately for victory checks.
- **One per turn**: Only 1 dev card may be played per turn (before or after rolling).

### Robber Rules

1. Active player must place the robber on a different hex (cannot stay on current hex).
2. If `friendlyRobber` is enabled in `GameConfig`, the robber cannot be placed on a hex adjacent to a player with ≤2 VP.
3. **Stealing is mandatory**: If any opponent has a settlement/city adjacent to the robber's new hex, the active player must steal 1 random resource from one of them. If no opponents are adjacent, no steal occurs.
4. If multiple opponents are adjacent, the active player chooses which one to steal from.

### Trade Rules

- **Trade state**: `GameState` should carry an `activeTrades: Map<string, TradeOffer>` so the UI can subscribe to trade state changes and handle race conditions (e.g., someone else accepted before you). Each trade offer has a unique ID; the map is the source of truth for all open offers.
- Players can withdraw/cancel trade offers at any time before acceptance.
- **Resource visibility**: Other players can see your total resource count, but not which resources you hold.
- **Simultaneous acceptance**: If a trade offer is broadcast to all players, the first valid `TRADE_ACCEPT` is executed. Any subsequent accepts for the same offer ID are rejected (the offer no longer exists). The server processes accepts in arrival order.
- **Counter-offers**: A `TRADE_COUNTER` creates a new offer (with a new ID) from the counter-party back to the original initiator. The original offer remains open until explicitly cancelled or accepted.

### Port Layout

Standard board has 9 ports at fixed coastal positions: one 2:1 port for each resource type (5 total) and four 3:1 generic ports. Port positions map to specific vertex pairs — this mapping must be defined in `board.ts` so the rules engine can look up port access by vertex ID.

### Derived State

- **Longest Road** (5+ roads, longest): computed via DFS on player's road graph
  - **Caching note**: Longest road should be cached per-player and only recalculated for the player who just built a road + the current longest road holder. This avoids unnecessary DFS traversals on every state change.
- **Largest Army** (3+ knights, most): tracked by knight count

### Victory Conditions — First to 10 VP

- Settlement: 1 VP
- City: 2 VP
- Longest Road: 2 VP
- Largest Army: 2 VP
- Victory Point dev cards: 1 VP each
