import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CatanRoom } from './catan-room.js';
import { getRedis, closeRedis, isRedisAvailable } from './redis.js';
import { listRecoverableGames } from './snapshot.js';

const port = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

// --------------------------------------------------------------------------
// Static file serving (production only)
// --------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
};

// Resolve the client dist directory relative to this file.
// In production Docker image: /app/packages/client/dist
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = join(__dirname, '../../client/dist');
const hasClientDist = existsSync(CLIENT_DIST);
let indexHtml: string | null = null;

if (isProduction && hasClientDist) {
  try {
    indexHtml = readFileSync(join(CLIENT_DIST, 'index.html'), 'utf-8');
  } catch {
    console.warn('Warning: client dist/index.html not found — static serving disabled');
  }
}

function serveStaticFile(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isProduction || !hasClientDist) return false;

  const url = req.url?.split('?')[0] ?? '/';

  // Try to serve the exact file
  const filePath = join(CLIENT_DIST, url === '/' ? 'index.html' : url);

  // Prevent directory traversal
  if (!filePath.startsWith(CLIENT_DIST)) return false;

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache hashed assets aggressively, everything else briefly
    const isHashed = /\.[a-f0-9]{8,}\.\w+$/.test(filePath);
    const cacheControl = isHashed
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': cacheControl,
    });
    res.end(content);
    return true;
  } catch {
    // File not found — fall through
  }

  // SPA fallback: for GET requests that don't look like files, serve index.html
  if (req.method === 'GET' && !extname(url) && indexHtml) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(indexHtml);
    return true;
  }

  return false;
}

// --------------------------------------------------------------------------
// HTTP server
// --------------------------------------------------------------------------

// Create HTTP server with CORS and health endpoint
const httpServer = createServer((req, res) => {
  // CORS headers (not needed for same-origin in production, but harmless)
  const origin = req.headers.origin ?? '';
  if (isProduction || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), redis: isRedisAvailable() }));
    return;
  }

  // Recovery endpoint — lists games that can be recovered from Redis
  if (req.url === '/recovery') {
    listRecoverableGames()
      .then((games) => {
        const summary = games.map(({ roomId, snapshot }) => ({
          roomId,
          roomCode: snapshot.roomCode,
          players: snapshot.seats.map((s) => s.displayName),
          maxSeats: snapshot.maxSeats,
          createdAt: new Date(snapshot.createdAt).toISOString(),
          updatedAt: new Date(snapshot.updatedAt).toISOString(),
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ recoverable: summary.length, games: summary }));
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to query recoverable games' }));
      });
    return;
  }

  // In production, serve static client files
  if (serveStaticFile(req, res)) return;

  res.writeHead(404);
  res.end('Not found');
});

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register room types
gameServer.define('catan', CatanRoom);

// --------------------------------------------------------------------------
// Recovery check on startup
// --------------------------------------------------------------------------

async function checkRecovery() {
  // Give Redis a moment to connect
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!isRedisAvailable()) {
    console.warn('[Recovery] Redis not available — crash recovery disabled');
    return;
  }

  try {
    const games = await listRecoverableGames();
    if (games.length > 0) {
      console.log(`[Recovery] Found ${games.length} recoverable game(s):`);
      for (const { roomId, snapshot } of games) {
        const players = snapshot.seats.map((s) => s.displayName).join(', ');
        console.log(`  - game:${roomId} (${players}) updated ${new Date(snapshot.updatedAt).toISOString()}`);
      }
      console.log('[Recovery] View details at /recovery endpoint');
    } else {
      console.log('[Recovery] No recoverable games found');
    }
  } catch (err) {
    console.warn('[Recovery] Failed to check for recoverable games:', (err as Error).message);
  }
}

// --------------------------------------------------------------------------
// Graceful shutdown
// --------------------------------------------------------------------------

async function gracefulShutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal} — saving active games...`);

  try {
    // Save all active rooms' snapshots via Colyseus room list
    const rooms = (gameServer as any).localPresence?.rooms ?? (gameServer as any).rooms;
    const savePromises: Promise<void>[] = [];

    if (rooms && typeof rooms[Symbol.iterator] === 'function') {
      for (const [, room] of rooms) {
        if (room instanceof CatanRoom && room.gameState) {
          savePromises.push(
            room.persistSnapshot().catch((err: Error) => {
              console.error(`[Shutdown] Failed to save game:${room.roomId}:`, err.message);
            }),
          );
        }
      }
    }

    await Promise.all(savePromises);
    console.log(`[Shutdown] Saved ${savePromises.length} game(s)`);
  } catch (err) {
    console.error('[Shutdown] Error saving games:', (err as Error).message);
  }

  // Close Redis
  await closeRedis();
  console.log('[Shutdown] Redis connection closed');

  // Shut down the server
  try {
    await gameServer.gracefullyShutdown(false);
  } catch {
    // Colyseus may throw if already shutting down
  }
  console.log('[Shutdown] Server stopped');

  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start listening
httpServer.listen(port, () => {
  console.log(`Settlement3 server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Recovery info: http://localhost:${port}/recovery`);

  // Initialize Redis (non-blocking, will warn if unavailable)
  getRedis();

  // Check for recoverable games after server is up
  checkRecovery();
});
