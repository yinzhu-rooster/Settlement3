import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;
let available = true;

export function isRedisAvailable(): boolean {
  return available;
}

export function getRedis(): Redis | null {
  if (!available) return null;

  if (!redis) {
    try {
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) {
            available = false;
            console.warn('[Redis] Max retries exceeded — disabling Redis persistence');
            return null; // stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      redis.on('error', (err) => {
        console.error('[Redis]', err.message);
      });

      redis.on('close', () => {
        console.warn('[Redis] Connection closed');
      });

      // Attempt connection (non-blocking)
      redis.connect().catch((err) => {
        console.warn('[Redis] Could not connect — crash recovery disabled:', err.message);
        available = false;
        redis = null;
      });
    } catch (err) {
      console.warn('[Redis] Failed to create client — crash recovery disabled');
      available = false;
      return null;
    }
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
}
