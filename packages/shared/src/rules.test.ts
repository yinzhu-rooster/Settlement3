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
import { type GameState, type ActionResult, type Resource, ALL_RESOURCES, hexKey } from './index';

// ============================================================
// Test helpers
// ============================================================

/** Unwrap a successful ActionResult or fail the test. */
function unwrap(result: ActionResult): GameState {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error);
  return result.state;
}

/** Helper to get a consistent starting state */
function freshState(): GameState {
  return createInitialState({ maxPlayers: 4 }, 42);
}

/** Complete setup phase by placing settlements and roads for all players */
function completeSetup(state: GameState): GameState {
  let s = state;

  // Setup phase 1: P1, P2, P3, P4 each place settlement + road
  for (let i = 0; i < 4; i++) {
    const validVerts = getValidSettlementVertices(s, s.currentPlayerIndex);
    expect(validVerts.length).toBeGreaterThan(0);
    s = unwrap(dispatch(s, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] }));

    const validEdges = getValidRoadEdges(s, s.currentPlayerIndex);
    expect(validEdges.length).toBeGreaterThan(0);
    s = unwrap(dispatch(s, { type: 'PLACE_ROAD', edgeId: validEdges[0] }));
  }

  // Setup phase 2: P4, P3, P2, P1 each place settlement + road
  for (let i = 0; i < 4; i++) {
    const validVerts = getValidSettlementVertices(s, s.currentPlayerIndex);
    expect(validVerts.length).toBeGreaterThan(0);
    s = unwrap(dispatch(s, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] }));

    const validEdges = getValidRoadEdges(s, s.currentPlayerIndex);
    expect(validEdges.length).toBeGreaterThan(0);
    s = unwrap(dispatch(s, { type: 'PLACE_ROAD', edgeId: validEdges[0] }));
  }

  return s;
}

/**
 * Issue #12: Roll dice and handle a 7 (discard/robber/steal) to reach post_roll.
 * Asserts success at every step.
 */
function getToPostRoll(state: GameState): GameState {
  let s = unwrap(dispatch(state, { type: 'ROLL_DICE' }));

  while (s.turnPhase !== 'post_roll') {
    if (s.turnPhase === 'robber_discard') {
      // Must iterate a copy since the array changes as players discard
      const pids = [...s.playersNeedingToDiscard];
      for (const pid of pids) {
        const p = s.players[pid];
        const total = ALL_RESOURCES.reduce((sum, r) => sum + p.resources[r], 0);
        const discardCount = Math.floor(total / 2);
        const discard: Partial<Record<Resource, number>> = {};
        let remaining = discardCount;
        for (const res of ALL_RESOURCES) {
          const take = Math.min(p.resources[res], remaining);
          if (take > 0) discard[res] = take;
          remaining -= take;
          if (remaining === 0) break;
        }
        s = unwrap(dispatch(s, { type: 'DISCARD_RESOURCES', resources: discard }, pid));
      }
    } else if (s.turnPhase === 'robber_move') {
      const hex = s.board.hexes.find(h => !h.hasRobber)!;
      s = unwrap(dispatch(s, { type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r }));
    } else if (s.turnPhase === 'robber_steal') {
      const target = s.robberStealTargets[0];
      s = unwrap(dispatch(s, { type: 'ROBBER_STEAL', targetPlayer: target }));
    } else {
      throw new Error(`Unexpected turnPhase: ${s.turnPhase}`);
    }
  }

  return s;
}

// ============================================================
// Tests
// ============================================================

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

    const s1 = unwrap(dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] }));
    expect(s1.turnPhase).toBe('setup_road');

    const validEdges = getValidRoadEdges(s1, 0);
    expect(validEdges.length).toBeGreaterThan(0);

    const s2 = unwrap(dispatch(s1, { type: 'PLACE_ROAD', edgeId: validEdges[0] }));
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
    const s = unwrap(dispatch(state, { type: 'ROLL_DICE' }));
    expect(s.diceRoll).toBeDefined();
    expect(s.diceRoll![0]).toBeGreaterThanOrEqual(1);
    expect(s.diceRoll![0]).toBeLessThanOrEqual(6);
    expect(s.diceRoll![1]).toBeGreaterThanOrEqual(1);
    expect(s.diceRoll![1]).toBeLessThanOrEqual(6);
  });

  it('rejects rolling dice twice', () => {
    const s1 = unwrap(dispatch(state, { type: 'ROLL_DICE' }));

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
    state = getToPostRoll(completeSetup(freshState()));
  });

  it('rejects settlement placement without resources', () => {
    // Ensure player has no resources
    const player = state.players[state.currentPlayerIndex];
    for (const res of ALL_RESOURCES) player.resources[res] = 0;

    const validVerts = getValidSettlementVertices(state, state.currentPlayerIndex);
    if (validVerts.length > 0) {
      const result = dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('resources');
      }
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
      const s = unwrap(dispatch(state, { type: 'PLACE_ROAD', edgeId: validEdges[0] }));
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
      const s = unwrap(dispatch(state, { type: 'PLACE_CITY', vertexId: validCities[0] }));
      const v = s.board.vertices[validCities[0]];
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
    state = getToPostRoll(completeSetup(freshState()));
  });

  it('allows 4:1 bank trade', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = []; // No ports

    const s = unwrap(dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'brick' }));
    expect(s.players[state.currentPlayerIndex].resources.wood).toBe(0);
    expect(s.players[state.currentPlayerIndex].resources.brick).toBe(1);
  });

  it('allows 3:1 with generic port', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 3, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = ['generic'];

    const s = unwrap(dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'ore' }));
    expect(s.players[state.currentPlayerIndex].resources.wood).toBe(0);
    expect(s.players[state.currentPlayerIndex].resources.ore).toBe(1);
  });

  it('allows 2:1 with specialty port', () => {
    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    player.ports = ['wood'];

    const s = unwrap(dispatch(state, { type: 'BANK_TRADE', giving: 'wood', receiving: 'wheat' }));
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
    state = getToPostRoll(state);

    const player = state.players[state.currentPlayerIndex];
    player.resources = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };
    const cardsBefore = player.devCards.length;

    const s = unwrap(dispatch(state, { type: 'BUY_DEV_CARD' }));
    expect(s.players[state.currentPlayerIndex].devCards.length).toBe(cardsBefore + 1);
  });

  it('rejects playing a dev card bought this turn', () => {
    state = getToPostRoll(state);

    // Give player a knight bought this turn
    const player = state.players[state.currentPlayerIndex];
    player.devCards.push({ type: 'knight', turnBought: state.turnNumber });

    const result = dispatch(state, { type: 'PLAY_DEV_CARD', cardType: 'knight' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('bought this turn');
    }
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
    state = getToPostRoll(state);

    const s = unwrap(dispatch(state, { type: 'END_TURN' }));
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.turnPhase).toBe('pre_roll');
  });
});

describe('undo', () => {
  it('undoes the last action', () => {
    const state = freshState();
    const validVerts = getValidSettlementVertices(state, 0);
    const s1 = unwrap(dispatch(state, { type: 'PLACE_SETTLEMENT', vertexId: validVerts[0] }));

    const s2 = unwrap(dispatch(s1, { type: 'UNDO' }));
    expect(s2.turnPhase).toBe('setup_settlement');
    // Vertex should be empty again
    const v = s2.board.vertices[validVerts[0]];
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
    state = getToPostRoll(completeSetup(freshState()));
  });

  it('creates a trade offer', () => {
    const player = state.players[0];
    player.resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };

    const s = unwrap(dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    }));
    expect(Object.keys(s.activeTrades).length).toBe(1);
  });

  it('allows accepting a trade', () => {
    const p0 = state.players[0];
    p0.resources = { wood: 2, brick: 2, sheep: 0, wheat: 0, ore: 0 };
    const p1 = state.players[1];
    p1.resources = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 0 };

    const s1 = unwrap(dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    }));

    const tradeId = Object.keys(s1.activeTrades)[0];
    const s2 = unwrap(dispatch(s1, { type: 'TRADE_ACCEPT', tradeId }, 1));

    expect(s2.players[0].resources.wood).toBe(1);
    expect(s2.players[0].resources.wheat).toBe(1);
    expect(s2.players[1].resources.wood).toBe(1);
    expect(s2.players[1].resources.wheat).toBe(1);
  });

  it('allows cancelling a trade', () => {
    const p0 = state.players[0];
    p0.resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };

    const s1 = unwrap(dispatch(state, {
      type: 'TRADE_OFFER',
      toPlayer: null,
      offering: { wood: 1 },
      requesting: { wheat: 1 },
    }));
    const tradeId = Object.keys(s1.activeTrades)[0];

    const s2 = unwrap(dispatch(s1, { type: 'TRADE_CANCEL', tradeId }));
    expect(s2.activeTrades[tradeId]?.status).toBe('cancelled');
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
    const s = unwrap(dispatch(state, { type: 'ROLL_DICE' }));
    if (s.players[0].victoryPoints >= 10) {
      expect(s.winner).toBe(0);
      expect(s.gamePhase).toBe('finished');
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
