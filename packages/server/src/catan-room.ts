import { Room, type Client } from '@colyseus/core';
import {
  type GameState,
  type GameAction,
  type GameConfig,
  type CreateRoomOptions,
  type JoinRoomOptions,
  DEFAULT_GAME_CONFIG,
  createInitialState,
  dispatch,
} from '@settlement3/shared';
import { saveSnapshot, deleteSnapshot, type GameSnapshot } from './snapshot.js';

/**
 * Strip fields that should not be broadcast to clients:
 * - history: local-only undo stack
 * - devCardDeck: hidden information
 */
function sanitizeState(state: GameState): Omit<GameState, 'history' | 'devCardDeck'> & { history: never[]; devCardDeck: never[] } {
  return {
    ...state,
    history: [] as never[],
    devCardDeck: [] as never[],
  };
}

interface PlayerSeat {
  sessionId: string;
  playerIndex: number;
  displayName: string;
  connected: boolean;
}

export class CatanRoom extends Room {
  gameState!: GameState;
  seats: Map<string, PlayerSeat> = new Map();
  maxSeats: number = 4;
  roomCode: string | undefined;
  disposalTimeout: ReturnType<typeof setTimeout> | null = null;

  // Map playerIndex → reconnection reservation (for allowReconnection)
  private reconnections: Map<number, { resolve: () => void }> = new Map();

  // Snapshot persistence
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;
  private dirty = false;
  private createdAt: number = Date.now();

  onCreate(options: CreateRoomOptions) {
    const maxPlayers = options.maxPlayers ?? DEFAULT_GAME_CONFIG.maxPlayers;
    this.maxSeats = maxPlayers;
    this.roomCode = options.roomCode;

    const config: Partial<GameConfig> = {
      ...options.config,
      maxPlayers,
    };

    this.gameState = createInitialState(config, options.seed);

    // Set metadata for matchmaking / lobby queries
    this.setMetadata({
      roomCode: this.roomCode,
      playerCount: 0,
      maxPlayers: this.maxSeats,
      hostName: '',
    });

    // Handle "action" messages from clients
    this.onMessage('action', (client: Client, message: { action: GameAction }) => {
      this.handleAction(client, message);
    });

    // Start periodic snapshot saves (every 30 seconds)
    this.createdAt = Date.now();
    this.snapshotInterval = setInterval(() => {
      if (this.dirty) {
        this.persistSnapshot();
        this.dirty = false;
      }
    }, 30_000);

    // Mark dirty so the initial state gets saved on the first interval
    this.dirty = true;
  }

  onJoin(client: Client, options: JoinRoomOptions) {
    const displayName = options?.displayName ?? `Player ${this.seats.size + 1}`;

    // Assign the next available seat
    const takenIndices = new Set<number>();
    for (const seat of this.seats.values()) {
      takenIndices.add(seat.playerIndex);
    }

    let playerIndex = -1;
    for (let i = 0; i < this.maxSeats; i++) {
      if (!takenIndices.has(i)) {
        playerIndex = i;
        break;
      }
    }

    if (playerIndex === -1) {
      // Should not happen if maxClients is set correctly, but guard anyway
      client.leave(4000);
      return;
    }

    const seat: PlayerSeat = {
      sessionId: client.sessionId,
      playerIndex,
      displayName,
      connected: true,
    };
    this.seats.set(client.sessionId, seat);

    // Update the player name in game state
    if (this.gameState.players[playerIndex]) {
      this.gameState.players[playerIndex].name = displayName;
    }

    // Send seat assignment to the joining client
    client.send('seat', {
      playerIndex,
      sessionId: client.sessionId,
    });

    // Update metadata
    this.setMetadata({
      roomCode: this.roomCode,
      playerCount: this.seats.size,
      maxPlayers: this.maxSeats,
      hostName: this.getHostName(),
    });

    // Broadcast updated state to all clients
    this.broadcast('state', sanitizeState(this.gameState));

    // Lock room when full
    if (this.seats.size >= this.maxSeats) {
      this.lock();
    }
  }

  async onLeave(client: Client, code?: number) {
    const seat = this.seats.get(client.sessionId);
    if (!seat) return;

    seat.connected = false;

    // Notify others that this player disconnected
    this.broadcast('playerLeft', { playerIndex: seat.playerIndex });

    // Code 1000 or 4000+ means intentional leave; otherwise unexpected disconnect
    const consented = code === 1000 || (code !== undefined && code >= 4000);

    if (consented) {
      // Player intentionally left — remove their seat
      this.seats.delete(client.sessionId);

      this.setMetadata({
        roomCode: this.roomCode,
        playerCount: this.connectedCount(),
        maxPlayers: this.maxSeats,
        hostName: this.getHostName(),
      });

      // Unlock if we were locked and now have space
      if (this.seats.size < this.maxSeats) {
        this.unlock();
      }
    } else {
      // Unexpected disconnect — hold seat for reconnection
      try {
        await this.allowReconnection(client, 120); // 2 minutes

        // Client reconnected
        seat.connected = true;
        seat.sessionId = client.sessionId;
        // Re-map with new sessionId if it changed
        this.seats.set(client.sessionId, seat);

        // Send seat info to reconnected client
        client.send('seat', {
          playerIndex: seat.playerIndex,
          sessionId: client.sessionId,
        });

        // Notify others
        this.broadcast('playerRejoined', { playerIndex: seat.playerIndex });

        // Send current state to reconnected client
        client.send('state', sanitizeState(this.gameState));
      } catch {
        // Reconnection timed out — remove seat
        this.seats.delete(client.sessionId);

        this.setMetadata({
          roomCode: this.roomCode,
          playerCount: this.connectedCount(),
          maxPlayers: this.maxSeats,
          hostName: this.getHostName(),
        });

        if (this.seats.size < this.maxSeats) {
          this.unlock();
        }
      }
    }
  }

  private handleAction(client: Client, message: { action: GameAction }) {
    const seat = this.seats.get(client.sessionId);
    if (!seat) {
      client.send('error', { message: 'Not seated in this game' });
      return;
    }

    const { action } = message;
    if (!action || !action.type) {
      client.send('error', { message: 'Invalid action format' });
      return;
    }

    // Validate the acting player matches their seat (except for actions any player can take)
    const playerIndex = seat.playerIndex;

    // Dispatch through the shared rules engine
    const result = dispatch(this.gameState, action, playerIndex);

    if (!result.success) {
      // Send error only to the acting client
      client.send('error', { message: result.error });
      return;
    }

    // Update server state
    this.gameState = result.state;
    this.dirty = true;

    // Broadcast sanitized state to all clients
    this.broadcast('state', sanitizeState(this.gameState));

    // Check for game end
    if (this.gameState.winner !== null) {
      this.broadcast('gameOver', {
        winner: this.gameState.winner,
        finalState: sanitizeState(this.gameState),
      });

      // Schedule room disposal after a delay so clients can show results
      this.disposalTimeout = setTimeout(() => {
        this.disconnect();
      }, 30_000);
    }
  }

  async onDispose() {
    if (this.disposalTimeout) {
      clearTimeout(this.disposalTimeout);
    }
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    // Delete the snapshot — game is done
    await deleteSnapshot(this.roomId);
  }

  // ---- Snapshot persistence ----

  buildSnapshot(): GameSnapshot {
    const seats: GameSnapshot['seats'] = [];
    for (const seat of this.seats.values()) {
      seats.push({
        sessionId: seat.sessionId,
        playerIndex: seat.playerIndex,
        displayName: seat.displayName,
        connected: seat.connected,
      });
    }
    return {
      gameState: this.gameState,
      seats,
      roomCode: this.roomCode,
      maxSeats: this.maxSeats,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
    };
  }

  async persistSnapshot(): Promise<void> {
    await saveSnapshot(this.roomId, this.buildSnapshot());
  }

  // ---- Helpers ----

  private connectedCount(): number {
    let count = 0;
    for (const seat of this.seats.values()) {
      if (seat.connected) count++;
    }
    return count;
  }

  private getHostName(): string {
    // First connected player is the "host" for display purposes
    for (const seat of this.seats.values()) {
      if (seat.connected) return seat.displayName;
    }
    return '';
  }
}
