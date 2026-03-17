import {
  type GameState,
  type GameAction,
  type ActionResult,
  type PlayerState,
  type Resource,
  type DevCardType,
  type TradeOffer,
  type GamePhase,
  type TurnPhase,
  type GameConfig,
  type Board,
  ALL_RESOURCES,
  BUILDING_COSTS,
  BUILDING_LIMITS,
  DEV_CARD_COUNTS,
  DEFAULT_GAME_CONFIG,
} from './types.js';
import { generateBoard, hexKey } from './board.js';

// ============================================================
// State creation
// ============================================================

export function createInitialState(config: Partial<GameConfig> = {}, seed?: number): GameState {
  const fullConfig = { ...DEFAULT_GAME_CONFIG, ...config };
  const board = generateBoard(seed);

  const players: PlayerState[] = [];
  const colors = ['red', 'blue', 'white', 'orange'] as const;
  for (let i = 0; i < fullConfig.maxPlayers; i++) {
    players.push({
      id: i,
      name: `Player ${i + 1}`,
      color: colors[i],
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      devCards: [],
      devCardsPlayedThisTurn: 0,
      knightsPlayed: 0,
      hasLongestRoad: false,
      hasLargestArmy: false,
      longestRoadLength: 0,
      settlementsRemaining: BUILDING_LIMITS.settlement,
      citiesRemaining: BUILDING_LIMITS.city,
      roadsRemaining: BUILDING_LIMITS.road,
      ports: [],
      victoryPoints: 0,
    });
  }

  // Build dev card deck
  const devCardDeck: DevCardType[] = [];
  for (const [type, count] of Object.entries(DEV_CARD_COUNTS)) {
    for (let i = 0; i < count; i++) {
      devCardDeck.push(type as DevCardType);
    }
  }
  // Shuffle the deck
  const rng = createSimpleRng(seed);
  shuffleInPlace(devCardDeck, rng);

  return {
    config: fullConfig,
    board,
    players,
    currentPlayerIndex: 0,
    gamePhase: 'setup_1',
    turnPhase: 'setup_settlement',
    turnNumber: 0,
    diceRoll: null,
    devCardDeck,
    activeTrades: new Map(),
    playersNeedingToDiscard: new Set(),
    robberStealTargets: [],
    winner: null,
    lastError: null,
    history: [],
    setupRound: 0,
  };
}

// ============================================================
// Simple RNG
// ============================================================

function createSimpleRng(seed?: number): () => number {
  let state = seed ?? Math.floor(Math.random() * 2147483647);
  return () => {
    state = (state * 1664525 + 1013904223) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================================
// Deep clone helpers (no external deps)
// ============================================================

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    board: cloneBoard(state.board),
    players: state.players.map(clonePlayer),
    devCardDeck: [...state.devCardDeck],
    activeTrades: new Map(
      Array.from(state.activeTrades.entries()).map(([k, v]) => [k, cloneTrade(v)])
    ),
    playersNeedingToDiscard: new Set(state.playersNeedingToDiscard),
    robberStealTargets: [...state.robberStealTargets],
    // Don't deep-clone history — it's a stack of already-cloned states
    history: [...state.history],
  };
}

function cloneBoard(board: Board): Board {
  return {
    hexes: board.hexes.map(h => ({ ...h })),
    vertices: new Map(Array.from(board.vertices.entries()).map(([k, v]) => [k, { ...v }])),
    edges: new Map(Array.from(board.edges.entries()).map(([k, v]) => [k, { ...v }])),
    ports: board.ports.map(p => ({ ...p, vertices: [...p.vertices] as [string, string] })),
    hexToVertices: cloneMapOfArrays(board.hexToVertices),
    hexToEdges: cloneMapOfArrays(board.hexToEdges),
    vertexToHexes: cloneMapOfArrays(board.vertexToHexes),
    vertexToEdges: cloneMapOfArrays(board.vertexToEdges),
    vertexToVertices: cloneMapOfArrays(board.vertexToVertices),
    edgeToVertices: new Map(
      Array.from(board.edgeToVertices.entries()).map(([k, v]) => [k, [...v] as [string, string]])
    ),
    edgeToHexes: cloneMapOfArrays(board.edgeToHexes),
  };
}

function cloneMapOfArrays<V>(map: Map<string, V[]>): Map<string, V[]> {
  return new Map(Array.from(map.entries()).map(([k, v]) => [k, [...v]]));
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    resources: { ...p.resources },
    devCards: p.devCards.map(d => ({ ...d })),
    ports: [...p.ports],
  };
}

function cloneTrade(t: TradeOffer): TradeOffer {
  return {
    ...t,
    offering: { ...t.offering },
    requesting: { ...t.requesting },
    respondedBy: new Map(t.respondedBy),
  };
}

// ============================================================
// Resource helpers
// ============================================================

function hasResources(player: PlayerState, cost: Partial<Record<Resource, number>>): boolean {
  for (const [res, amount] of Object.entries(cost)) {
    if ((player.resources[res as Resource] ?? 0) < (amount ?? 0)) return false;
  }
  return true;
}

function deductResources(player: PlayerState, cost: Partial<Record<Resource, number>>): void {
  for (const [res, amount] of Object.entries(cost)) {
    player.resources[res as Resource] -= amount ?? 0;
  }
}

function addResources(player: PlayerState, resources: Partial<Record<Resource, number>>): void {
  for (const [res, amount] of Object.entries(resources)) {
    player.resources[res as Resource] += amount ?? 0;
  }
}

function totalResources(player: PlayerState): number {
  return ALL_RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
}

// ============================================================
// Validation helpers
// ============================================================

function canPlaceSettlement(state: GameState, vertexId: string, playerIdx: number, isSetup: boolean): string | null {
  const vertex = state.board.vertices.get(vertexId);
  if (!vertex) return 'Invalid vertex';
  if (vertex.building !== null) return 'Vertex already occupied';

  // Distance rule — no adjacent settlement/city
  const neighbors = state.board.vertexToVertices.get(vertexId) ?? [];
  for (const nid of neighbors) {
    const neighbor = state.board.vertices.get(nid);
    if (neighbor?.building !== null) return 'Too close to another settlement';
  }

  const player = state.players[playerIdx];
  if (player.settlementsRemaining <= 0) return 'No settlements remaining';

  if (!isSetup) {
    // Must be adjacent to own road
    const adjacentEdges = state.board.vertexToEdges.get(vertexId) ?? [];
    const hasOwnRoad = adjacentEdges.some(eid => {
      const edge = state.board.edges.get(eid);
      return edge?.road && edge.owner === playerIdx;
    });
    if (!hasOwnRoad) return 'Must be adjacent to your road';

    if (!hasResources(player, BUILDING_COSTS.settlement)) return 'Not enough resources';
  }

  return null;
}

function canPlaceRoad(state: GameState, edgeId: string, playerIdx: number, isSetup: boolean, setupVertexId?: string): string | null {
  const edge = state.board.edges.get(edgeId);
  if (!edge) return 'Invalid edge';
  if (edge.road) return 'Edge already has a road';

  const player = state.players[playerIdx];
  if (player.roadsRemaining <= 0) return 'No roads remaining';

  const [v1, v2] = state.board.edgeToVertices.get(edgeId) ?? [null, null];
  if (!v1 || !v2) return 'Invalid edge';

  if (isSetup && setupVertexId) {
    // Setup: road must be adjacent to the just-placed settlement
    if (v1 !== setupVertexId && v2 !== setupVertexId) {
      return 'Road must connect to your settlement';
    }
  } else if (!isSetup) {
    // Must connect to own settlement/city or own road
    const connectsToOwnBuilding = [v1, v2].some(vid => {
      const v = state.board.vertices.get(vid);
      return v?.owner === playerIdx;
    });
    const connectsToOwnRoad = [v1, v2].some(vid => {
      // Check if any road from this vertex belongs to the player
      // But the vertex must not be occupied by an opponent (road blocked by opponent building)
      const vertexOwner = state.board.vertices.get(vid)?.owner;
      if (vertexOwner !== null && vertexOwner !== playerIdx) return false;
      const vedges = state.board.vertexToEdges.get(vid) ?? [];
      return vedges.some(eid => {
        if (eid === edgeId) return false;
        const e = state.board.edges.get(eid);
        return e?.road && e.owner === playerIdx;
      });
    });
    if (!connectsToOwnBuilding && !connectsToOwnRoad) {
      return 'Road must connect to your network';
    }

    // Check resources unless free road building
    if (state.turnPhase !== 'road_building_1' && state.turnPhase !== 'road_building_2') {
      if (!hasResources(player, BUILDING_COSTS.road)) return 'Not enough resources';
    }
  }

  return null;
}

// ============================================================
// Longest Road (DFS)
// ============================================================

export function calculateLongestRoad(state: GameState, playerIdx: number): number {
  const playerEdges: Set<string> = new Set();
  for (const [eid, edge] of state.board.edges) {
    if (edge.road && edge.owner === playerIdx) {
      playerEdges.add(eid);
    }
  }

  if (playerEdges.size === 0) return 0;

  let maxLength = 0;

  // DFS from each edge endpoint
  function dfs(vertexId: string, visited: Set<string>, length: number): void {
    maxLength = Math.max(maxLength, length);

    const edges = state.board.vertexToEdges.get(vertexId) ?? [];
    for (const eid of edges) {
      if (!playerEdges.has(eid) || visited.has(eid)) continue;

      // Check if vertex is blocked by opponent building
      const v = state.board.vertices.get(vertexId);
      if (v && v.owner !== null && v.owner !== playerIdx && length > 0) continue;

      const [v1, v2] = state.board.edgeToVertices.get(eid) ?? ['', ''];
      const nextVertex = v1 === vertexId ? v2 : v1;

      visited.add(eid);
      dfs(nextVertex, visited, length + 1);
      visited.delete(eid);
    }
  }

  // Find all vertices that are endpoints of player's roads
  const startVertices = new Set<string>();
  for (const eid of playerEdges) {
    const [v1, v2] = state.board.edgeToVertices.get(eid) ?? ['', ''];
    startVertices.add(v1);
    startVertices.add(v2);
  }

  for (const sv of startVertices) {
    dfs(sv, new Set(), 0);
  }

  return maxLength;
}

function updateLongestRoad(state: GameState): void {
  // Recalculate for all players
  let longestLength = 0;
  let longestPlayer = -1;

  for (let i = 0; i < state.players.length; i++) {
    const length = calculateLongestRoad(state, i);
    state.players[i].longestRoadLength = length;
    state.players[i].hasLongestRoad = false;

    if (length >= 5 && length > longestLength) {
      longestLength = length;
      longestPlayer = i;
    }
  }

  // Handle ties — current holder keeps it
  if (longestPlayer >= 0) {
    // Check for ties
    const tiedPlayers = state.players.filter(p => p.longestRoadLength === longestLength);
    if (tiedPlayers.length === 1) {
      state.players[longestPlayer].hasLongestRoad = true;
    } else {
      // On a tie, the first player to reach that length keeps it
      // For now, give it to the lowest-indexed player among tied
      // (or keep current holder if they're tied)
      const currentHolder = state.players.find(p => p.hasLongestRoad);
      if (currentHolder && currentHolder.longestRoadLength === longestLength) {
        currentHolder.hasLongestRoad = true;
      } else {
        state.players[longestPlayer].hasLongestRoad = true;
      }
    }
  }
}

function updateLargestArmy(state: GameState): void {
  let mostKnights = 0;
  let armyPlayer = -1;

  for (let i = 0; i < state.players.length; i++) {
    state.players[i].hasLargestArmy = false;
    if (state.players[i].knightsPlayed >= 3 && state.players[i].knightsPlayed > mostKnights) {
      mostKnights = state.players[i].knightsPlayed;
      armyPlayer = i;
    }
  }

  if (armyPlayer >= 0) {
    state.players[armyPlayer].hasLargestArmy = true;
  }
}

// ============================================================
// Victory point calculation
// ============================================================

function calculateVP(state: GameState, playerIdx: number): number {
  const player = state.players[playerIdx];
  let vp = 0;

  // Count buildings
  for (const [, vertex] of state.board.vertices) {
    if (vertex.owner === playerIdx) {
      vp += vertex.building === 'city' ? 2 : 1;
    }
  }

  // Longest road
  if (player.hasLongestRoad) vp += 2;
  // Largest army
  if (player.hasLargestArmy) vp += 2;
  // VP dev cards
  vp += player.devCards.filter(d => d.type === 'victoryPoint').length;

  return vp;
}

function updateVictoryPoints(state: GameState): void {
  for (let i = 0; i < state.players.length; i++) {
    state.players[i].victoryPoints = calculateVP(state, i);
  }
}

function checkWinner(state: GameState): void {
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].victoryPoints >= 10) {
      state.winner = i;
      state.gamePhase = 'finished';
      return;
    }
  }
}

// ============================================================
// Action dispatcher
// ============================================================

export function dispatch(state: GameState, action: GameAction, actingPlayer?: number): ActionResult {
  const playerIdx = actingPlayer ?? state.currentPlayerIndex;

  // Undo is special — don't push history
  if (action.type === 'UNDO') {
    return handleUndo(state);
  }

  // Save history for undo (but don't nest histories to save memory)
  const stateForHistory = cloneState(state);
  stateForHistory.history = [];

  const newState = cloneState(state);
  newState.lastError = null;

  // Push current state to history (limit to 50 entries)
  newState.history = [...state.history, stateForHistory].slice(-50);

  const result = applyAction(newState, action, playerIdx);
  if (!result.success) {
    return result;
  }

  // Update derived state
  updateVictoryPoints(result.state);
  checkWinner(result.state);

  return result;
}

function applyAction(state: GameState, action: GameAction, playerIdx: number): ActionResult {
  if (state.gamePhase === 'finished') {
    return { success: false, error: 'Game is already over' };
  }

  switch (action.type) {
    case 'UNDO':
      return handleUndo(state);
    case 'ROLL_DICE':
      return handleRollDice(state, playerIdx);
    case 'PLACE_SETTLEMENT':
      return handlePlaceSettlement(state, playerIdx, action.vertexId);
    case 'PLACE_CITY':
      return handlePlaceCity(state, playerIdx, action.vertexId);
    case 'PLACE_ROAD':
      return handlePlaceRoad(state, playerIdx, action.edgeId);
    case 'BUY_DEV_CARD':
      return handleBuyDevCard(state, playerIdx);
    case 'PLAY_DEV_CARD':
      return handlePlayDevCard(state, playerIdx, action.cardType);
    case 'MOVE_ROBBER':
      return handleMoveRobber(state, playerIdx, action.hexQ, action.hexR);
    case 'ROBBER_STEAL':
      return handleRobberSteal(state, playerIdx, action.targetPlayer);
    case 'DISCARD_RESOURCES':
      return handleDiscardResources(state, playerIdx, action.resources);
    case 'TRADE_OFFER':
      return handleTradeOffer(state, playerIdx, action.toPlayer, action.offering, action.requesting);
    case 'TRADE_ACCEPT':
      return handleTradeAccept(state, playerIdx, action.tradeId);
    case 'TRADE_REJECT':
      return handleTradeReject(state, playerIdx, action.tradeId);
    case 'TRADE_CANCEL':
      return handleTradeCancel(state, playerIdx, action.tradeId);
    case 'TRADE_COUNTER':
      return handleTradeCounter(state, playerIdx, action.tradeId, action.offering, action.requesting);
    case 'BANK_TRADE':
      return handleBankTrade(state, playerIdx, action.giving, action.receiving);
    case 'YEAR_OF_PLENTY_PICK':
      return handleYearOfPlentyPick(state, playerIdx, action.resources);
    case 'MONOPOLY_PICK':
      return handleMonopolyPick(state, playerIdx, action.resource);
    case 'END_TURN':
      return handleEndTurn(state, playerIdx);
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// ============================================================
// Action handlers
// ============================================================

function handleUndo(state: GameState): ActionResult {
  if (state.history.length === 0) {
    return { success: false, error: 'Nothing to undo' };
  }
  const previousState = state.history[state.history.length - 1];
  previousState.history = state.history.slice(0, -1);
  return { success: true, state: previousState };
}

function handleRollDice(state: GameState, playerIdx: number): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.gamePhase !== 'main') return { success: false, error: 'Cannot roll dice now' };
  if (state.turnPhase !== 'pre_roll') return { success: false, error: 'Already rolled this turn' };

  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;

  state.diceRoll = [die1, die2];

  if (total === 7) {
    // Check who needs to discard
    const discardPlayers = new Set<number>();
    for (let i = 0; i < state.players.length; i++) {
      if (totalResources(state.players[i]) > state.config.discardThreshold) {
        discardPlayers.add(i);
      }
    }

    if (discardPlayers.size > 0) {
      state.playersNeedingToDiscard = discardPlayers;
      state.turnPhase = 'robber_discard';
    } else {
      state.turnPhase = 'robber_move';
    }
  } else {
    // Distribute resources
    distributeResources(state, total);
    state.turnPhase = 'post_roll';
  }

  return { success: true, state };
}

function distributeResources(state: GameState, roll: number): void {
  for (const hex of state.board.hexes) {
    if (hex.numberToken !== roll || hex.hasRobber) continue;
    if (hex.resource === 'desert') continue;

    const hk = hexKey(hex.q, hex.r);
    const vertices = state.board.hexToVertices.get(hk) ?? [];

    for (const vid of vertices) {
      const vertex = state.board.vertices.get(vid);
      if (!vertex || vertex.building === null || vertex.owner === null) continue;

      const amount = vertex.building === 'city' ? 2 : 1;
      state.players[vertex.owner].resources[hex.resource as Resource] += amount;
    }
  }
}

function handlePlaceSettlement(state: GameState, playerIdx: number, vertexId: string): ActionResult {
  const isSetup = state.gamePhase === 'setup_1' || state.gamePhase === 'setup_2';

  if (isSetup) {
    if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
    if (state.turnPhase !== 'setup_settlement') return { success: false, error: 'Not the right time to place a settlement' };
  } else {
    if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
    if (state.turnPhase !== 'post_roll') return { success: false, error: 'Must roll dice first' };
  }

  const error = canPlaceSettlement(state, vertexId, playerIdx, isSetup);
  if (error) return { success: false, error };

  const vertex = state.board.vertices.get(vertexId)!;
  vertex.building = 'settlement';
  vertex.owner = playerIdx;
  state.players[playerIdx].settlementsRemaining--;

  if (!isSetup) {
    deductResources(state.players[playerIdx], BUILDING_COSTS.settlement);
  }

  // Check for port access
  for (const port of state.board.ports) {
    if (port.vertices.includes(vertexId) && !state.players[playerIdx].ports.includes(port.type)) {
      state.players[playerIdx].ports.push(port.type);
    }
  }

  if (isSetup) {
    // Second settlement in setup_2 grants initial resources
    if (state.gamePhase === 'setup_2') {
      const adjacentHexes = state.board.vertexToHexes.get(vertexId) ?? [];
      for (const hk of adjacentHexes) {
        const hex = state.board.hexes.find(h => hexKey(h.q, h.r) === hk);
        if (hex && hex.resource !== 'desert') {
          state.players[playerIdx].resources[hex.resource as Resource]++;
        }
      }
    }
    state.turnPhase = 'setup_road';
    // Store the last placed settlement for road validation
    (state as any)._lastSetupVertex = vertexId;
  }

  updateLongestRoad(state);

  return { success: true, state };
}

function handlePlaceCity(state: GameState, playerIdx: number, vertexId: string): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.gamePhase !== 'main') return { success: false, error: 'Cannot upgrade during setup' };
  if (state.turnPhase !== 'post_roll') return { success: false, error: 'Must roll dice first' };

  const vertex = state.board.vertices.get(vertexId);
  if (!vertex) return { success: false, error: 'Invalid vertex' };
  if (vertex.building !== 'settlement') return { success: false, error: 'No settlement to upgrade' };
  if (vertex.owner !== playerIdx) return { success: false, error: 'Not your settlement' };

  const player = state.players[playerIdx];
  if (player.citiesRemaining <= 0) return { success: false, error: 'No cities remaining' };
  if (!hasResources(player, BUILDING_COSTS.city)) return { success: false, error: 'Not enough resources' };

  vertex.building = 'city';
  player.citiesRemaining--;
  player.settlementsRemaining++; // Return settlement to supply
  deductResources(player, BUILDING_COSTS.city);

  return { success: true, state };
}

function handlePlaceRoad(state: GameState, playerIdx: number, edgeId: string): ActionResult {
  const isSetup = state.gamePhase === 'setup_1' || state.gamePhase === 'setup_2';
  const isFreeRoad = state.turnPhase === 'road_building_1' || state.turnPhase === 'road_building_2';

  if (isSetup) {
    if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
    if (state.turnPhase !== 'setup_road') return { success: false, error: 'Not the right time to place a road' };
  } else if (isFreeRoad) {
    if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  } else {
    if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
    if (state.turnPhase !== 'post_roll') return { success: false, error: 'Must roll dice first' };
  }

  const setupVertexId = isSetup ? (state as any)._lastSetupVertex : undefined;
  const error = canPlaceRoad(state, edgeId, playerIdx, isSetup, setupVertexId);
  if (error) return { success: false, error };

  const edge = state.board.edges.get(edgeId)!;
  edge.road = true;
  edge.owner = playerIdx;
  state.players[playerIdx].roadsRemaining--;

  if (!isSetup && !isFreeRoad) {
    deductResources(state.players[playerIdx], BUILDING_COSTS.road);
  }

  if (isSetup) {
    delete (state as any)._lastSetupVertex;
    advanceSetup(state);
  } else if (state.turnPhase === 'road_building_1') {
    state.turnPhase = 'road_building_2';
  } else if (state.turnPhase === 'road_building_2') {
    state.turnPhase = 'post_roll';
  }

  updateLongestRoad(state);

  return { success: true, state };
}

function advanceSetup(state: GameState): void {
  const numPlayers = state.players.length;

  if (state.gamePhase === 'setup_1') {
    if (state.currentPlayerIndex < numPlayers - 1) {
      state.currentPlayerIndex++;
    } else {
      // Switch to setup_2, same player goes again (reverse order)
      state.gamePhase = 'setup_2';
    }
    state.turnPhase = 'setup_settlement';
  } else if (state.gamePhase === 'setup_2') {
    if (state.currentPlayerIndex > 0) {
      state.currentPlayerIndex--;
    } else {
      // Setup complete, begin main phase
      state.gamePhase = 'main';
      state.turnPhase = 'pre_roll';
      state.turnNumber = 1;
      state.currentPlayerIndex = 0;
    }
    if (state.gamePhase === 'setup_2') {
      state.turnPhase = 'setup_settlement';
    }
  }
}

function handleBuyDevCard(state: GameState, playerIdx: number): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'post_roll') return { success: false, error: 'Must roll dice first' };

  const player = state.players[playerIdx];
  if (!hasResources(player, BUILDING_COSTS.devCard)) return { success: false, error: 'Not enough resources' };
  if (state.devCardDeck.length === 0) return { success: false, error: 'No dev cards remaining' };

  deductResources(player, BUILDING_COSTS.devCard);
  const cardType = state.devCardDeck.pop()!;
  player.devCards.push({ type: cardType, turnBought: state.turnNumber });

  return { success: true, state };
}

function handlePlayDevCard(state: GameState, playerIdx: number, cardType: DevCardType): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.gamePhase !== 'main') return { success: false, error: 'Cannot play dev cards during setup' };
  if (cardType === 'victoryPoint') return { success: false, error: 'VP cards are not played' };

  const player = state.players[playerIdx];

  // Can play before or after rolling, but only 1 per turn
  if (player.devCardsPlayedThisTurn >= 1) return { success: false, error: 'Already played a dev card this turn' };
  if (state.turnPhase !== 'pre_roll' && state.turnPhase !== 'post_roll') {
    return { success: false, error: 'Cannot play dev card now' };
  }

  // Find the card (must not have been bought this turn)
  const cardIndex = player.devCards.findIndex(
    d => d.type === cardType && d.turnBought < state.turnNumber
  );
  if (cardIndex === -1) return { success: false, error: "You don't have that card or it was bought this turn" };

  // Remove the card
  player.devCards.splice(cardIndex, 1);
  player.devCardsPlayedThisTurn++;

  switch (cardType) {
    case 'knight':
      player.knightsPlayed++;
      updateLargestArmy(state);
      state.turnPhase = 'robber_move';
      break;
    case 'roadBuilding':
      state.turnPhase = 'road_building_1';
      break;
    case 'yearOfPlenty':
      state.turnPhase = 'year_of_plenty';
      break;
    case 'monopoly':
      state.turnPhase = 'monopoly';
      break;
  }

  return { success: true, state };
}

function handleMoveRobber(state: GameState, playerIdx: number, hexQ: number, hexR: number): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'robber_move') return { success: false, error: 'Not the right time to move robber' };

  // Find the hex
  const targetHex = state.board.hexes.find(h => h.q === hexQ && h.r === hexR);
  if (!targetHex) return { success: false, error: 'Invalid hex' };
  if (targetHex.hasRobber) return { success: false, error: 'Robber must move to a different hex' };

  // Friendly robber check
  if (state.config.friendlyRobber) {
    const hk = hexKey(hexQ, hexR);
    const adjacentVertices = state.board.hexToVertices.get(hk) ?? [];
    for (const vid of adjacentVertices) {
      const vertex = state.board.vertices.get(vid);
      if (vertex && vertex.owner !== null && vertex.owner !== playerIdx) {
        if (state.players[vertex.owner].victoryPoints <= 2) {
          return { success: false, error: 'Friendly robber: cannot target player with 2 or fewer VP' };
        }
      }
    }
  }

  // Move robber
  for (const hex of state.board.hexes) {
    hex.hasRobber = false;
  }
  targetHex.hasRobber = true;

  // Find steal targets
  const hk = hexKey(hexQ, hexR);
  const adjacentVertices = state.board.hexToVertices.get(hk) ?? [];
  const targets = new Set<number>();
  for (const vid of adjacentVertices) {
    const vertex = state.board.vertices.get(vid);
    if (vertex && vertex.owner !== null && vertex.owner !== playerIdx && totalResources(state.players[vertex.owner]) > 0) {
      targets.add(vertex.owner);
    }
  }

  if (targets.size === 0) {
    // No one to steal from
    state.turnPhase = state.diceRoll ? 'post_roll' : 'pre_roll';
  } else if (targets.size === 1) {
    // Auto-steal from the only target
    const target = [...targets][0];
    stealRandomResource(state, playerIdx, target);
    state.turnPhase = state.diceRoll ? 'post_roll' : 'pre_roll';
  } else {
    state.robberStealTargets = [...targets];
    state.turnPhase = 'robber_steal';
  }

  return { success: true, state };
}

function stealRandomResource(state: GameState, thiefIdx: number, victimIdx: number): void {
  const victim = state.players[victimIdx];
  const available: Resource[] = [];
  for (const r of ALL_RESOURCES) {
    for (let i = 0; i < victim.resources[r]; i++) {
      available.push(r);
    }
  }
  if (available.length === 0) return;

  const stolen = available[Math.floor(Math.random() * available.length)];
  victim.resources[stolen]--;
  state.players[thiefIdx].resources[stolen]++;
}

function handleRobberSteal(state: GameState, playerIdx: number, targetPlayer: number): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'robber_steal') return { success: false, error: 'Not the right time to steal' };
  if (!state.robberStealTargets.includes(targetPlayer)) return { success: false, error: 'Invalid steal target' };

  stealRandomResource(state, playerIdx, targetPlayer);
  state.robberStealTargets = [];
  state.turnPhase = state.diceRoll ? 'post_roll' : 'pre_roll';

  return { success: true, state };
}

function handleDiscardResources(state: GameState, playerIdx: number, resources: Partial<Record<Resource, number>>): ActionResult {
  if (state.turnPhase !== 'robber_discard') return { success: false, error: 'Not the right time to discard' };
  if (!state.playersNeedingToDiscard.has(playerIdx)) return { success: false, error: "You don't need to discard" };

  const player = state.players[playerIdx];
  const total = totalResources(player);
  const discardCount = Math.floor(total / 2);

  // Validate discard amount
  let actualDiscard = 0;
  for (const [res, amount] of Object.entries(resources)) {
    const amt = amount ?? 0;
    if (amt < 0) return { success: false, error: 'Cannot discard negative resources' };
    if (amt > player.resources[res as Resource]) return { success: false, error: `Not enough ${res} to discard` };
    actualDiscard += amt;
  }

  if (actualDiscard !== discardCount) {
    return { success: false, error: `Must discard exactly ${discardCount} cards` };
  }

  deductResources(player, resources);
  state.playersNeedingToDiscard.delete(playerIdx);

  if (state.playersNeedingToDiscard.size === 0) {
    state.turnPhase = 'robber_move';
  }

  return { success: true, state };
}

function handleTradeOffer(
  state: GameState,
  playerIdx: number,
  toPlayer: number | null,
  offering: Partial<Record<Resource, number>>,
  requesting: Partial<Record<Resource, number>>
): ActionResult {
  if (state.gamePhase !== 'main') return { success: false, error: 'Cannot trade during setup' };
  if (state.turnPhase !== 'post_roll') return { success: false, error: 'Can only trade after rolling' };
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Only the active player can offer trades' };

  const player = state.players[playerIdx];
  if (!hasResources(player, offering)) return { success: false, error: 'Not enough resources to offer' };

  const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const trade: TradeOffer = {
    id: tradeId,
    fromPlayer: playerIdx,
    toPlayer,
    offering: { ...offering },
    requesting: { ...requesting },
    status: 'open',
    respondedBy: new Map(),
  };

  state.activeTrades.set(tradeId, trade);
  return { success: true, state };
}

function handleTradeAccept(state: GameState, playerIdx: number, tradeId: string): ActionResult {
  const trade = state.activeTrades.get(tradeId);
  if (!trade) return { success: false, error: 'Trade not found' };
  if (trade.status !== 'open') return { success: false, error: 'Trade is no longer open' };
  if (trade.fromPlayer === playerIdx) return { success: false, error: 'Cannot accept your own trade' };
  if (trade.toPlayer !== null && trade.toPlayer !== playerIdx) return { success: false, error: 'Trade not offered to you' };

  const accepter = state.players[playerIdx];
  if (!hasResources(accepter, trade.requesting)) return { success: false, error: 'Not enough resources to accept' };

  const offerer = state.players[trade.fromPlayer];
  if (!hasResources(offerer, trade.offering)) return { success: false, error: 'Offerer no longer has the resources' };

  // Execute trade
  deductResources(offerer, trade.offering);
  addResources(accepter, trade.offering);
  deductResources(accepter, trade.requesting);
  addResources(offerer, trade.requesting);

  trade.status = 'accepted';
  trade.respondedBy.set(playerIdx, 'accepted');

  // Close all other open trades
  for (const [, t] of state.activeTrades) {
    if (t.status === 'open') t.status = 'cancelled';
  }

  return { success: true, state };
}

function handleTradeReject(state: GameState, playerIdx: number, tradeId: string): ActionResult {
  const trade = state.activeTrades.get(tradeId);
  if (!trade) return { success: false, error: 'Trade not found' };
  if (trade.status !== 'open') return { success: false, error: 'Trade is no longer open' };

  trade.respondedBy.set(playerIdx, 'rejected');

  // If all target players rejected, auto-cancel
  if (trade.toPlayer === null) {
    const allRejected = state.players.every(
      (p, i) => i === trade.fromPlayer || trade.respondedBy.get(i) === 'rejected'
    );
    if (allRejected) trade.status = 'rejected';
  } else {
    trade.status = 'rejected';
  }

  return { success: true, state };
}

function handleTradeCancel(state: GameState, playerIdx: number, tradeId: string): ActionResult {
  const trade = state.activeTrades.get(tradeId);
  if (!trade) return { success: false, error: 'Trade not found' };
  if (trade.fromPlayer !== playerIdx) return { success: false, error: 'Only the offerer can cancel' };
  if (trade.status !== 'open') return { success: false, error: 'Trade is no longer open' };

  trade.status = 'cancelled';
  return { success: true, state };
}

function handleTradeCounter(
  state: GameState,
  playerIdx: number,
  tradeId: string,
  offering: Partial<Record<Resource, number>>,
  requesting: Partial<Record<Resource, number>>
): ActionResult {
  const originalTrade = state.activeTrades.get(tradeId);
  if (!originalTrade) return { success: false, error: 'Trade not found' };
  if (originalTrade.status !== 'open') return { success: false, error: 'Trade is no longer open' };
  if (originalTrade.fromPlayer === playerIdx) return { success: false, error: 'Cannot counter your own trade' };

  const player = state.players[playerIdx];
  if (!hasResources(player, offering)) return { success: false, error: 'Not enough resources for counter-offer' };

  // Create new counter-offer
  const counterId = `trade_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const counterTrade: TradeOffer = {
    id: counterId,
    fromPlayer: playerIdx,
    toPlayer: originalTrade.fromPlayer,
    offering: { ...offering },
    requesting: { ...requesting },
    status: 'open',
    respondedBy: new Map(),
  };

  state.activeTrades.set(counterId, counterTrade);
  return { success: true, state };
}

function handleBankTrade(state: GameState, playerIdx: number, giving: Resource, receiving: Resource): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'post_roll') return { success: false, error: 'Can only trade after rolling' };

  const player = state.players[playerIdx];

  // Determine ratio
  let ratio = 4;
  if (player.ports.includes(giving)) {
    ratio = 2;
  } else if (player.ports.includes('generic')) {
    ratio = 3;
  }

  if (player.resources[giving] < ratio) {
    return { success: false, error: `Need ${ratio} ${giving} for bank trade` };
  }

  player.resources[giving] -= ratio;
  player.resources[receiving] += 1;

  return { success: true, state };
}

function handleYearOfPlentyPick(state: GameState, playerIdx: number, resources: [Resource, Resource]): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'year_of_plenty') return { success: false, error: 'Not the right time' };

  state.players[playerIdx].resources[resources[0]]++;
  state.players[playerIdx].resources[resources[1]]++;
  state.turnPhase = state.diceRoll ? 'post_roll' : 'pre_roll';

  return { success: true, state };
}

function handleMonopolyPick(state: GameState, playerIdx: number, resource: Resource): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.turnPhase !== 'monopoly') return { success: false, error: 'Not the right time' };

  let total = 0;
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIdx) continue;
    total += state.players[i].resources[resource];
    state.players[i].resources[resource] = 0;
  }
  state.players[playerIdx].resources[resource] += total;
  state.turnPhase = state.diceRoll ? 'post_roll' : 'pre_roll';

  return { success: true, state };
}

function handleEndTurn(state: GameState, playerIdx: number): ActionResult {
  if (playerIdx !== state.currentPlayerIndex) return { success: false, error: 'Not your turn' };
  if (state.gamePhase !== 'main') return { success: false, error: 'Cannot end turn during setup' };
  if (state.turnPhase !== 'post_roll') return { success: false, error: 'Must roll dice before ending turn' };

  // Clear turn state
  state.diceRoll = null;
  state.players[playerIdx].devCardsPlayedThisTurn = 0;

  // Cancel all open trades
  for (const [, trade] of state.activeTrades) {
    if (trade.status === 'open') trade.status = 'cancelled';
  }

  // Advance to next player
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber++;
  state.turnPhase = 'pre_roll';

  return { success: true, state };
}

// ============================================================
// Query helpers (for UI)
// ============================================================

export function getValidSettlementVertices(state: GameState, playerIdx: number): string[] {
  const isSetup = state.gamePhase === 'setup_1' || state.gamePhase === 'setup_2';
  const valid: string[] = [];
  for (const [vid] of state.board.vertices) {
    if (canPlaceSettlement(state, vid, playerIdx, isSetup) === null) {
      valid.push(vid);
    }
  }
  return valid;
}

export function getValidRoadEdges(state: GameState, playerIdx: number): string[] {
  const isSetup = state.gamePhase === 'setup_1' || state.gamePhase === 'setup_2';
  const setupVertexId = isSetup ? (state as any)._lastSetupVertex : undefined;
  const valid: string[] = [];
  for (const [eid] of state.board.edges) {
    if (canPlaceRoad(state, eid, playerIdx, isSetup, setupVertexId) === null) {
      valid.push(eid);
    }
  }
  return valid;
}

export function getValidCityVertices(state: GameState, playerIdx: number): string[] {
  const valid: string[] = [];
  for (const [vid, vertex] of state.board.vertices) {
    if (vertex.building === 'settlement' && vertex.owner === playerIdx) {
      if (hasResources(state.players[playerIdx], BUILDING_COSTS.city) &&
          state.players[playerIdx].citiesRemaining > 0) {
        valid.push(vid);
      }
    }
  }
  return valid;
}

export function getValidRobberHexes(state: GameState): { q: number; r: number }[] {
  return state.board.hexes
    .filter(h => !h.hasRobber)
    .map(h => ({ q: h.q, r: h.r }));
}
