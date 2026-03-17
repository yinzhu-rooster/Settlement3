import { Client, type Room } from 'colyseus.js';
import {
  type GameState,
  type GameAction,
  type ActionResult,
  dispatch as rulesDispatch,
} from '@settlement3/shared';
import type { GameService } from './game-service';

const RECONNECT_TIMEOUT_MS = 10_000;
const SESSION_STORAGE_KEY = 'settlement3:reconnect';

interface ReconnectData {
  roomId: string;
  reconnectionToken: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export class OnlineGameService implements GameService {
  private room: Room;
  private state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private playerIndex = -1;
  private error: string | null = null;
  private client: Client;
  private connectionStatus: ConnectionStatus = 'connected';

  private constructor(client: Client, room: Room, initialState: GameState, playerIndex: number) {
    this.client = client;
    this.room = room;
    this.state = initialState;
    this.playerIndex = playerIndex;
    this.setupListeners();
  }

  // ------------------------------------------------------------------
  // Static factories
  // ------------------------------------------------------------------

  static async create(
    serverUrl: string,
    options: { maxPlayers: 3 | 4; displayName: string; roomCode?: string },
  ): Promise<OnlineGameService> {
    const client = new Client(serverUrl);
    const room = await client.create('catan', {
      maxPlayers: options.maxPlayers,
      displayName: options.displayName,
      roomCode: options.roomCode,
    });
    return OnlineGameService.waitForSeat(client, room);
  }

  static async join(
    serverUrl: string,
    roomId: string,
    displayName: string,
  ): Promise<OnlineGameService> {
    const client = new Client(serverUrl);
    const room = await client.joinById(roomId, { displayName });
    return OnlineGameService.waitForSeat(client, room);
  }

  static async joinByCode(
    serverUrl: string,
    roomCode: string,
    displayName: string,
  ): Promise<OnlineGameService> {
    const client = new Client(serverUrl);
    // Join via room code — the server matches on the roomCode filter
    const room = await client.join('catan', { roomCode, displayName });
    return OnlineGameService.waitForSeat(client, room);
  }

  static async reconnect(serverUrl: string): Promise<OnlineGameService | null> {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    try {
      const data: ReconnectData = JSON.parse(raw);
      const client = new Client(serverUrl);
      const room = await client.reconnect(data.reconnectionToken);
      return OnlineGameService.waitForSeat(client, room);
    } catch {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // GameService interface
  // ------------------------------------------------------------------

  dispatch(action: GameAction): ActionResult {
    // Run action through the local rules engine for instant validation.
    // Use the current player index since in online mode the local player is always acting.
    const localResult = rulesDispatch(this.state, action, this.playerIndex);
    if (!localResult.success) {
      // Fails locally — don't bother sending to server.
      return localResult;
    }

    // Passed local validation — send to server. The authoritative state will arrive via "state" message.
    this.room.send('action', { action });

    // Return optimistic success with current state (will be replaced by server state).
    return { success: true, state: this.state };
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): GameState {
    return this.state;
  }

  // ------------------------------------------------------------------
  // Online-specific
  // ------------------------------------------------------------------

  getPlayerIndex(): number {
    return this.playerIndex;
  }

  getError(): string | null {
    return this.error;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getRoomId(): string {
    return this.room.roomId;
  }

  disconnect(): void {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    this.room.leave(true);
    this.setStatus('disconnected');
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private static waitForSeat(client: Client, room: Room): Promise<OnlineGameService> {
    return new Promise<OnlineGameService>((resolve, reject) => {
      let resolved = false;
      let state: GameState | null = null;
      let playerIndex = -1;

      function tryResolve() {
        if (resolved) return;
        if (state && playerIndex >= 0) {
          resolved = true;
          resolve(new OnlineGameService(client, room, state, playerIndex));
        }
      }

      room.onMessage('seat', (data: { playerIndex: number; sessionId: string }) => {
        playerIndex = data.playerIndex;
        tryResolve();
      });

      room.onMessage('state', (data: GameState) => {
        state = data;
        tryResolve();
      });

      room.onError((code, message) => {
        if (!resolved) {
          reject(new Error(`Room error (${code}): ${message}`));
        }
      });

      room.onLeave((code) => {
        if (!resolved) {
          reject(new Error(`Disconnected before seated (code: ${code})`));
        }
      });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          room.leave();
          reject(new Error('Timed out waiting for seat assignment'));
        }
      }, 15_000);
    });
  }

  private setupListeners(): void {
    // Remove any previously attached listeners to prevent duplication on reconnect
    this.room.removeAllListeners();

    // Persist reconnection token
    this.saveReconnectData();

    this.room.onMessage('state', (data: GameState) => {
      this.state = data;
      this.error = null;
      this.notify();
    });

    this.room.onMessage('error', (data: { message: string }) => {
      this.error = data.message;
    });

    this.room.onMessage('seat', (data: { playerIndex: number }) => {
      this.playerIndex = data.playerIndex;
    });

    this.room.onMessage('playerLeft', (_data: { playerIndex: number }) => {
      // Could surface this in UI — for now the state update will reflect it
    });

    this.room.onMessage('playerRejoined', (_data: { playerIndex: number }) => {
      // Could surface this in UI
    });

    this.room.onMessage('gameOver', (data: { winner: number; finalState: GameState }) => {
      this.state = data.finalState;
      this.notify();
    });

    this.room.onLeave((code) => {
      // Code 1000 = normal close, 4000+ = intentional disconnect
      if (code >= 4000 || code === 1000) {
        this.setStatus('disconnected');
        return;
      }
      // Abnormal close — attempt reconnect
      this.attemptReconnect();
    });

    this.room.onError((code, message) => {
      console.error(`[OnlineGameService] Room error (${code}):`, message);
      this.error = message ?? `Connection error (${code})`;
    });
  }

  private async attemptReconnect(): Promise<void> {
    this.setStatus('reconnecting');
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      this.setStatus('error');
      return;
    }
    try {
      const data: ReconnectData = JSON.parse(raw);
      const room = await Promise.race([
        this.client.reconnect(data.reconnectionToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Reconnect timeout')), RECONNECT_TIMEOUT_MS),
        ),
      ]);
      this.room = room;
      this.setupListeners();
      this.setStatus('connected');
    } catch {
      this.setStatus('error');
      this.error = 'Failed to reconnect to the game.';
    }
  }

  private saveReconnectData(): void {
    const data: ReconnectData = {
      roomId: this.room.roomId,
      reconnectionToken: this.room.reconnectionToken,
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
