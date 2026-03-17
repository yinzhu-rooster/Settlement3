import type { GameState } from '@settlement3/shared';
import { getRedis } from './redis.js';

const KEY_PREFIX = 'game:';
const TTL_SECONDS = 4 * 60 * 60; // 4 hours

export interface GameSnapshot {
  gameState: GameState;
  seats: Array<{
    sessionId: string;
    playerIndex: number;
    displayName: string;
    connected: boolean;
  }>;
  roomCode: string | undefined;
  maxSeats: number;
  createdAt: number;
  updatedAt: number;
}

function key(roomId: string): string {
  return `${KEY_PREFIX}${roomId}`;
}

export async function saveSnapshot(roomId: string, snapshot: GameSnapshot): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const data = JSON.stringify(snapshot);
    await redis.set(key(roomId), data, 'EX', TTL_SECONDS);
  } catch (err) {
    console.error(`[Snapshot] Failed to save game:${roomId}:`, (err as Error).message);
  }
}

export async function loadSnapshot(roomId: string): Promise<GameSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get(key(roomId));
    if (!data) return null;
    return JSON.parse(data) as GameSnapshot;
  } catch (err) {
    console.error(`[Snapshot] Failed to load game:${roomId}:`, (err as Error).message);
    return null;
  }
}

export async function deleteSnapshot(roomId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key(roomId));
  } catch (err) {
    console.error(`[Snapshot] Failed to delete game:${roomId}:`, (err as Error).message);
  }
}

export async function listRecoverableGames(): Promise<Array<{ roomId: string; snapshot: GameSnapshot }>> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    const results: Array<{ roomId: string; snapshot: GameSnapshot }> = [];

    for (const k of keys) {
      const data = await redis.get(k);
      if (data) {
        try {
          const snapshot = JSON.parse(data) as GameSnapshot;
          const roomId = k.slice(KEY_PREFIX.length);
          results.push({ roomId, snapshot });
        } catch {
          // skip malformed entries
        }
      }
    }

    return results;
  } catch (err) {
    console.error('[Snapshot] Failed to list recoverable games:', (err as Error).message);
    return [];
  }
}
