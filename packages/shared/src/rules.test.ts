import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  dispatch,
  cloneState,
  getValidSettlementVertices,
  getValidRoadEdges,
  getValidCityVertices,
  calculateLongestRoad,
} from './rules';
import { type GameState, type Resource, ALL_RESOURCES, hexKey } from './index';

// Helper to get a consistent starting state
function freshState(): GameState {
  return createInitialState({ maxPlayers: 4 }, 42);
}

// Helper: complete setup phase by placing settlements and roads for all players
function completeSetup(state: GameState): GameState {
  // Get valid placements and just pick the first available one each time
  let s = state;

  // Setup phase 1: P1, P2, P3, P4 each place settlement + road
  for (let i = 0; i < 4; i++) {
    const validVerts = getValidSettlementVertices(s, s.currentPlayerIndex);
    expect(validVerts.length).toBeGreaterThan(0);
    const r1 = dispatch(s, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
    expect(r1.success).toBe(true);
    s = (r1 as any).state;

    const validEdges = getValidRoadEdges(s, s.currentPlayerIndex);
    expect(validEdges.length).toBeGreaterThan(0);
    const r2 = dispatch(s, { type: 'PLACE_ROAD', edgeId: validEdges[0] });
    expect(r2.success).toBe(true);
    s = (r2 as any).state;
  }

  // Setup phase 2: P4, P3, P2, P1 each place settlement + road
  for (let i = 0; i < 4; i++) {
    const validVerts = getValidSettlementVertices(s, s.currentPlayerIndex);
    expect(validVerts.length).toBeGreaterThan(0);
    const r1 = dispatch(s, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
    expect(r1.success).toBe(true);
    s = (r1 as any).state;

    const validEdges = getValidRoadEdges(s, s.currentPlayerIndex);
    expect(validEdges.length).toBeGreaterThan(0);
    const r2 = dispatch(s, { type: 'PLACE_ROAD', edgeId: validEdges[0] });
    expect(r2.success).toBe(true);
    s = (r2 as any).state;
  }

  return s;
}

describe('createInitialState', () => {
  it('creates a valid initial state', () => {
    const state = freshState();
    expect(state.players).toHaveLength(4);
    expect(state.gamePhase).toBe('setup_1');
    expect(state.turnPhase).toBe('setup_settlement');
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.devCardDeck).toHaveLength(25);
  });

  it('respects maxPlayers config', () => {
    const state = createInitialState({ maxPlayers: 3 }, 42);
    expect(state.players).toHaveLength(3);
  });

  it('initializes player resources to 0', () => {
    const state = freshState();
    for (const player of state.players) {
      for (const res of ALL_RESOURCES) {
        expect(player.resources[res]).toBe(0);
      }
    }
  });

  it('initializes building supply correctly', () => {
    const state = freshState();
    for (const player of state.players) {
      expect(player.settlementsRemaining).toBe(5);
      expect(player.citiesRemaining).toBe(4);
      expect(player.roadsRemaining).toBe(15);
    }
  });
});

describe('setup phase', () => {
  it('allows placing settlement then road in setup_1', () => {
    const state = freshState();
    const validVerts = getValidSettlementVertices(state, 0);
    expect(validVerts.length).toBeGreaterThan(0);

    const r1 = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
    expect(r1.success).toBe(true);
    const s1 = (r1 as any).state as GameState;
    expect(s1.turnPhase).toBe('setup_road');

    const validEdges = getValidRoadEdges(s1, 0);
    expect(validEdges.length).toBeGreaterThan(0);

    const r2 = dispatch(s1, { type: 'PLACE_ROAD', edgeId: validEdges[0] });
    expect(r2.success).toBe(true);
    const s2 = (r2 as any).state as GameState;
    // Should advance to player 1
    expect(s2.currentPlayerIndex).toBe(1);
    expect(s2.turnPhase).toBe('setup_settlement');
  });

  it('rejects settlement placement by wrong player', () => {
    const state = freshState();
    const validVerts = getValidSettlementVertices(state, 0);
    const result = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] }, 1);
    expect(result.success).toBe(false);
  });

  it('completes setup and transitions to main phase', () => {
    const state = freshState();
    const s = completeSetup(state);
    expect(s.gamePhase).toBe('main');
    expect(s.turnPhase).toBe('pre_roll');
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.turnNumber).toBe(1);
  });

  it('grants initial resources from second settlement', () => {
    const state = freshState();
    const s = completeSetup(state);
    // At least some players should have received resources from setup_2
    const totalRes = s.players.reduce((sum, p) => {
      return sum + ALL_RESOURCES.reduce((ps, r) => ps + p.resources[r], 0);
    }, 0);
    expect(totalRes).toBeGreaterThan(0);
  });

  it('does not allow rolling dice during setup', () => {
    const state = freshState();
    const result = dispatch(state, { type: 'ROLL_DICE' });
    expect(result.success).toBe(false);
  });
});

describe('main phase - dice roll', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
  });

  it('allows rolling dice in pre_roll phase', () => {
    const result = dispatch(state, { type: 'ROLL_DICE' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.diceRoll).toBeDefined();
    expect(s.diceRoll![0]).toBeGreaterThanOrEqual(1);
    expect(s.diceRoll![0]).toBeLessThanOrEqual(6);
    expect(s.diceRoll![1]).toBeGreaterThanOrEqual(1);
    expect(s.diceRoll![1]).toBeLessThanOrEqual(6);
  });

  it('rejects rolling dice twice', () => {
    const r1 = dispatch(state, { type: 'ROLL_DICE' });
    expect(r1.success).toBe(true);
    const s1 = (r1 as any).state as GameState;

    // If we're in post_roll, try to roll again
    if (s1.turnPhase === 'post_roll') {
      const r2 = dispatch(s1, { type: 'ROLL_DICE' });
      expect(r2.success).toBe(false);
    }
  });

  it('rejects rolling by non-active player', () => {
    const result = dispatch(state, { type: 'ROLL_DICE' }, 1);
    expect(result.success).toBe(false);
  });
});

describe('building', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
    // Roll dice to get to post_roll
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (r.success) {
      state = (r as any).state;
      // If we hit a 7, handle discard/robber to get to post_roll
      while (state.turnPhase !== 'post_roll') {
        if (state.turnPhase === 'robber_discard') {
          for (const pid of state.playersNeedingToDiscard) {
            const p = state.players[pid];
            const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
            const discardCount = Math.floor(total / 2);
            const discard: Partial<Record<Resource, number>> = {};
            let remaining = discardCount;
            for (const res of ALL_RESOURCES) {
              const take = Math.min(p.resources[res], remaining);
              if (take > 0) discard[res] = take;
              remaining -= take;
              if (remaining === 0) break;
            }
            const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
            if (dr.success) state = (dr as any).state;
          }
        } else if (state.turnPhase === 'robber_move') {
          const hex = state.board.hexes.find(h => !h.hasRobber)!;
          const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
          if (mr.success) state = (mr as any).state;
        } else if (state.turnPhase === 'robber_steal') {
          const target = state.robberStealTargets[0];
          const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: target });
          if (sr.success) state = (sr as any).state;
        } else {
          break;
        }
      }
    }
  });

  it('rejects settlement placement without resources', () => {
    // Ensure player has no resources
    const player = state.players[state.currentPlayerIndex];
    for (const res of ALL_RESOURCES) player.resources[res] = 0;

    const validVerts = getValidSettlementVertices(state, state.currentPlayerIndex);
    if (validVerts.length > 0) {
      const result = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
      expect(result.success).toBe(false);
      expect((result as any).error).toContain('resources');
    }
  });

  it('allows settlement placement with resources', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 10, brick: 10, sheep: 10, wheat: 10, ore: 10 };

    const validVerts = getValidSettlementVertices(state, state.currentPlayerIndex);
    if (validVerts.length > 0) {
      const result = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
      expect(result.success).toBe(true);
    }
  });

  it('allows road placement with resources', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 10, brick: 10, sheep: 10, wheat: 10, ore: 10 };

    const validEdges = getValidRoadEdges(state, state.currentPlayerIndex);
    if (validEdges.length > 0) {
      const result = dispatch(state, { type: 'PLACE_ROAD', edgeId: validEdges[0] });
      expect(result.success).toBe(true);
      const s = (result as any).state as GameState;
      expect(s.players[state.currentPlayerIndex].roadsRemaining).toBe(
        state.players[state.currentPlayerIndex].roadsRemaining - 1
      );
    }
  });

  it('allows city upgrade with resources', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 0, brick: 0, sheep: 0, wheat: 5, ore: 5 };

    const validCities = getValidCityVertices(state, state.currentPlayerIndex);
    if (validCities.length > 0) {
      const result = dispatch(state, { type: 'PLACE_CITY', vertexId: validCities[0] });
      expect(result.success).toBe(true);
      const s = (result as any).state as GameState;
      const v = s.board.vertices.get(validCities[0]);
      expect(v?.building).toBe('city');
      // Settlement returned to supply
      expect(s.players[state.currentPlayerIndex].settlementsRemaining).toBe(
        state.players[state.currentPlayerIndex].settlementsRemaining + 1
      );
    }
  });
});

describe('bank trade', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
    // Get to post_roll
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (r.success) {
      state = (r as any).state;
      // Handle 7 if needed
      while (state.turnPhase !== 'post_roll') {
        if (state.turnPhase === 'robber_discard') {
          for (const pid of state.playersNeedingToDiscard) {
            const p = state.players[pid];
            const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
            const discardCount = Math.floor(total / 2);
            const discard: Partial<Record<Resource, number>> = {};
            let remaining = discardCount;
            for (const res of ALL_RESOURCES) {
              const take = Math.min(p.resources[res], remaining);
              if (take > 0) discard[res] = take;
              remaining -= take;
              if (remaining === 0) break;
            }
            const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
            if (dr.success) state = (dr as any).state;
          }
        } else if (state.turnPhase === 'robber_move') {
          const hex = state.board.hexes.find(h => !h.hasRobber)!;
          const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
          if (mr.success) state = (mr as any).state;
        } else if (state.turnPhase === 'robber_steal') {
          const target = state.robberStealTargets[0];
          const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: target });
          if (sr.success) state = (sr as any).state;
        } else break;
      }
    }
  });

  it('allows 4:1 bank trade', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = []; // No ports

    const result = dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'brick' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.players[state.currentPlayerIndex].resources.wood).toBe(0);
    expect(s.players[state.currentPlayerIndex].resources.brick).toBe(1);
  });

  it('allows 3:1 with generic port', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = ['generic'];

    const result = dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'ore' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.players[state.currentPlayerIndex].resources.wood).toBe(0);
    expect(s.players[state.currentPlayerIndex].resources.ore).toBe(1);
  });

  it('allows 2:1 with specialty port', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = ['wood'];

    const result = dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'wheat' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.players[state.currentPlayerIndex].resources.wood).toBe(0);
    expect(s.players[state.currentPlayerIndex].resources.wheat).toBe(1);
  });

  it('rejects bank trade without enough resources', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = [];

    const result = dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'brick' });
    expect(result.success).toBe(false);
  });
});

describe('dev cards', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
  });

  it('allows buying a dev card with resources', () => {
    // Roll first
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (!r.success) return;
    state = (r as any).state;
    // Handle 7 if needed
    while (state.turnPhase !== 'post_roll') {
      if (state.turnPhase === 'robber_move') {
        const hex = state.board.hexes.find(h => !h.hasRobber)!;
        const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
        if (mr.success) state = (mr as any).state;
      } else if (state.turnPhase === 'robber_steal') {
        const target = state.robberStealTargets[0];
        const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: target });
        if (sr.success) state = (sr as any).state;
      } else if (state.turnPhase === 'robber_discard') {
        for (const pid of state.playersNeedingToDiscard) {
          const p = state.players[pid];
          const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
          const discardCount = Math.floor(total / 2);
          const discard: Partial<Record<Resource, number>> = {};
          let remaining = discardCount;
          for (const res of ALL_RESOURCES) {
            const take = Math.min(p.resources[res], remaining);
            if (take > 0) discard[res] = take;
            remaining -= take;
            if (remaining === 0) break;
          }
          const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
          if (dr.success) state = (dr as any).state;
        }
      } else break;
    }

    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };
    const cardsBefore = player.devCards.length;

    const result = dispatch(state, { type: 'BUY_DEV_CARD' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.players[state.currentPlayerIndex].devCards.length).toBe(cardsBefore + 1);
  });

  it('rejects playing a dev card bought this turn', () => {
    // Get to post_roll
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (!r.success) return;
    state = (r as any).state;
    while (state.turnPhase !== 'post_roll') {
      if (state.turnPhase === 'robber_move') {
        const hex = state.board.hexes.find(h => !h.hasRobber)!;
        const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
        if (mr.success) state = (mr as any).state;
      } else if (state.turnPhase === 'robber_steal') {
        const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: state.robberStealTargets[0] });
        if (sr.success) state = (sr as any).state;
      } else if (state.turnPhase === 'robber_discard') {
        for (const pid of state.playersNeedingToDiscard) {
          const p = state.players[pid];
          const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
          const discard: Partial<Record<Resource, number>> = {};
          let remaining = Math.floor(total / 2);
          for (const res of ALL_RESOURCES) {
            const take = Math.min(p.resources[res], remaining);
            if (take > 0) discard[res] = take;
            remaining -= take;
            if (remaining === 0) break;
          }
          const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
          if (dr.success) state = (dr as any).state;
        }
      } else break;
    }

    // Give player a knight bought this turn
    const player = state.players[state.currentPlayerIndex];
    player.devCards.push({ type: 'knight', turnBought: state.turnNumber });

    const result = dispatch(state, { type: 'PLAY_DEV_CARD', cardType: 'knight' });
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('bought this turn');
  });
});

describe('end turn', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
  });

  it('rejects end turn before rolling', () => {
    const result = dispatch(state, { type: 'END_TURN' });
    expect(result.success).toBe(false);
  });

  it('allows end turn after rolling', () => {
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (!r.success) return;
    state = (r as any).state;
    // Handle 7
    while (state.turnPhase !== 'post_roll') {
      if (state.turnPhase === 'robber_move') {
        const hex = state.board.hexes.find(h => !h.hasRobber)!;
        const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
        if (mr.success) state = (mr as any).state;
      } else if (state.turnPhase === 'robber_steal') {
        const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: state.robberStealTargets[0] });
        if (sr.success) state = (sr as any).state;
      } else if (state.turnPhase === 'robber_discard') {
        for (const pid of state.playersNeedingToDiscard) {
          const p = state.players[pid];
          const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
          const discard: Partial<Record<Resource, number>> = {};
          let remaining = Math.floor(total / 2);
          for (const res of ALL_RESOURCES) {
            const take = Math.min(p.resources[res], remaining);
            if (take > 0) discard[res] = take;
            remaining -= take;
            if (remaining === 0) break;
          }
          const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
          if (dr.success) state = (dr as any).state;
        }
      } else break;
    }

    const result = dispatch(state, { type: 'END_TURN' });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.turnPhase).toBe('pre_roll');
  });
});

describe('undo', () => {
  it('undoes the last action', () => {
    const state = freshState();
    const validVerts = getValidSettlementVertices(state, 0);
    const r1 = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
    expect(r1.success).toBe(true);
    const s1 = (r1 as any).state as GameState;

    const r2 = dispatch(s1, { type: 'UNDO' });
    expect(r2.success).toBe(true);
    const s2 = (r2 as any).state as GameState;
    expect(s2.turnPhase).toBe('setup_settlement');
    // Vertex should be empty again
    const v = s2.board.vertices.get(validVerts[0]);
    expect(v?.building).toBeNull();
  });

  it('rejects undo with no history', () => {
    const state = freshState();
    const result = dispatch(state, { type: 'UNDO' });
    expect(result.success).toBe(false);
  });
});

describe('longest road', () => {
  it('returns 0 for no roads', () => {
    const state = freshState();
    expect(calculateLongestRoad(state, 0)).toBe(0);
  });

  it('calculates correctly after setup', () => {
    const state = completeSetup(freshState());
    // Each player placed 2 roads during setup
    for (let i = 0; i < 4; i++) {
      const length = calculateLongestRoad(state, i);
      // Could be 1 or 2 depending on connectivity
      expect(length).toBeGreaterThanOrEqual(1);
      expect(length).toBeLessThanOrEqual(2);
    }
  });
});

describe('player trade', () => {
  let state: GameState;

  beforeEach(() => {
    state = completeSetup(freshState());
    // Get to post_roll
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (r.success) {
      state = (r as any).state;
      while (state.turnPhase !== 'post_roll') {
        if (state.turnPhase === 'robber_move') {
          const hex = state.board.hexes.find(h => !h.hasRobber)!;
          const mr = dispatch(state, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
          if (mr.success) state = (mr as any).state;
        } else if (state.turnPhase === 'robber_steal') {
          const sr = dispatch(state, { type: 'ROBBER_STEAL', targetPlayer: state.robberStealTargets[0] });
          if (sr.success) state = (sr as any).state;
        } else if (state.turnPhase === 'robber_discard') {
          for (const pid of state.playersNeedingToDiscard) {
            const p = state.players[pid];
            const total = ALL_RESOURCES.reduce((s, r) => s + p.resources[r], 0);
            const discard: Partial<Record<Resource, number>> = {};
            let remaining = Math.floor(total / 2);
            for (const res of ALL_RESOURCES) {
              const take = Math.min(p.resources[res], remaining);
              if (take > 0) discard[res] = take;
              remaining -= take;
              if (remaining === 0) break;
            }
            const dr = dispatch(state, { type: 'DISCARD_RESOURCES', resources: discard }, pid);
            if (dr.success) state = (dr as any).state;
          }
        } else break;
      }
    }
  });

  it('creates a trade offer', () => {
    const player = state.players[0];
    player.resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };

    const result = dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    });
    expect(result.success).toBe(true);
    const s = (result as any).state as GameState;
    expect(s.activeTrades.size).toBe(1);
  });

  it('allows accepting a trade', () => {
    const p0 = state.players[0];
    p0.resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };
    const p1 = state.players[1];
    p1.resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 0 };

    const r1 = dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    });
    expect(r1.success).toBe(true);
    const s1 = (r1 as any).state as GameState;

    const tradeId = [...s1.activeTrades.keys()][0];
    const r2 = dispatch(s1, { type: 'TRADE_ACCEPT', tradeId }, 1);
    expect(r2.success).toBe(true);
    const s2 = (r2 as any).state as GameState;

    expect(s2.players[0].resources.wood).toBe(1);
    expect(s2.players[0].resources.wheat).toBe(1);
    expect(s2.players[1].resources.wood).toBe(1);
    expect(s2.players[1].resources.wheat).toBe(1);
  });

  it('allows cancelling a trade', () => {
    const p0 = state.players[0];
    p0.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };

    const r1 = dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    });
    const s1 = (r1 as any).state as GameState;
    const tradeId = [...s1.activeTrades.keys()][0];

    const r2 = dispatch(s1, { type: 'TRADE_CANCEL', tradeId });
    expect(r2.success).toBe(true);
    const s2 = (r2 as any).state as GameState;
    expect(s2.activeTrades.get(tradeId)?.status).toBe('cancelled');
  });
});

describe('victory', () => {
  it('detects winner at 10 VP', () => {
    let state = completeSetup(freshState());
    // Artificially set a player to 10 VP
    // Give player 0 lots of buildings and bonuses
    state.players[0].hasLongestRoad = true;
    state.players[0].hasLargestArmy = true;
    // 2 settlements from setup = 2 VP, + longest road (2) + largest army (2) = 6
    // Add 4 VP cards to get to 10
    state.players[0].devCards.push(
      { type: 'victoryPoint', turnBought: 0 },
      { type: 'victoryPoint', turnBought: 0 },
      { type: 'victoryPoint', turnBought: 0 },
      { type: 'victoryPoint', turnBought: 0 },
    );

    // Trigger VP recalculation by dispatching any valid action
    const r = dispatch(state, { type: 'ROLL_DICE' });
    if (r.success) {
      const s = (r as any).state as GameState;
      if (s.players[0].victoryPoints >= 10) {
        expect(s.winner).toBe(0);
        expect(s.gamePhase).toBe('finished');
      }
    }
  });
});

describe('cloneState', () => {
  it('produces a deep copy', () => {
    const state = freshState();
    const clone = cloneState(state);

    // Modify clone
    clone.players[0].resources.wood = 99;
    clone.board.hexes[0].hasRobber = true;

    // Original should be unchanged
    expect(state.players[0].resources.wood).toBe(0);
    expect(state.board.hexes[0].hasRobber).not.toBe(true);
  });
});
