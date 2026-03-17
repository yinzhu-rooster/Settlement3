// ============================================================
// Network Protocol Types — Settlement3
// ============================================================
// Pure TypeScript, no external deps. Used by both client and server.

import type { GameAction, GameState } from './types.js';

// ============================================================
// Client → Server messages
// ============================================================

export interface ClientMessages {
  action: { action: GameAction };
}

// ============================================================
// Server → Client messages
// ============================================================

export interface ServerMessages {
  state: GameState;
  error: { message: string };
  seat: { playerIndex: number; sessionId: string };
  playerLeft: { playerIndex: number };
  playerRejoined: { playerIndex: number };
  gameOver: { winner: number; finalState: GameState };
}

// ============================================================
// Room creation / join options
// ============================================================

export interface CreateRoomOptions {
  maxPlayers?: 3 | 4;
  roomCode?: string;
  config?: Partial<import('./types.js').GameConfig>;
  seed?: number;
}

export interface JoinRoomOptions {
  displayName: string;
  roomCode?: string;
}
