import { createServer } from 'http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CatanRoom } from './catan-room.js';

const port = Number(process.env.PORT) || 3001;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

// Create HTTP server with CORS and health endpoint
const httpServer = createServer((req, res) => {
  // CORS headers
  const origin = req.headers.origin ?? '';
  if (process.env.NODE_ENV === 'production' || allowedOrigins.includes(origin)) {
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
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Create Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register room types
gameServer.define('catan', CatanRoom);

// Start listening
httpServer.listen(port, () => {
  console.log(`Settlement3 server listening on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});
