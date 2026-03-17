import {
  type Board,
  type HexTile,
  type Vertex,
  type Edge,
  type Port,
  type Resource,
  type PortType,
  type HexCoord,
} from './types.js';
import { nextRng, initRngState, shuffleWithRng } from './rng.js';

// ============================================================
// Hex grid coordinate helpers (axial coordinates)
// ============================================================

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/**
 * Vertex IDs are derived from the three surrounding hex coordinates.
 * Each vertex sits at the junction of exactly 2 or 3 hexes.
 * We normalize by sorting hex keys alphabetically.
 */
export function vertexId(hexes: HexCoord[]): string {
  return 'v:' + hexes.map(h => hexKey(h.q, h.r)).sort().join('|');
}

/**
 * Edge IDs are derived from the two vertices they connect.
 * Normalized by sorting vertex IDs.
 */
export function edgeId(v1: string, v2: string): string {
  return 'e:' + [v1, v2].sort().join('~');
}

// ============================================================
// Standard Catan board layout
// ============================================================

// The 19 hex positions in axial coordinates (standard Catan spiral)
const HEX_POSITIONS: HexCoord[] = [
  // Center
  { q: 0, r: 0 },
  // Ring 1 (6 hexes)
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  // Ring 2 (12 hexes)
  { q: 2, r: 0 },
  { q: 1, r: 1 },
  { q: 0, r: 2 },
  { q: -1, r: 2 },
  { q: -2, r: 2 },
  { q: -2, r: 1 },
  { q: -2, r: 0 },
  { q: -1, r: -1 },
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  { q: 2, r: -1 },
];

// Standard resource distribution
const RESOURCE_TILES: (Resource | 'desert')[] = [
  'wood', 'wood', 'wood', 'wood',
  'wheat', 'wheat', 'wheat', 'wheat',
  'sheep', 'sheep', 'sheep', 'sheep',
  'brick', 'brick', 'brick',
  'ore', 'ore', 'ore',
  'desert',
];

// Standard number token placement order (excluding desert)
const NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

// ============================================================
// Six vertices around a hex (axial coordinate offsets)
// ============================================================

// Each hex has 6 vertices. In axial coords, we identify each vertex
// by its position relative to neighboring hexes.
// The 6 neighbors of hex (q, r) in axial coordinates:
const HEX_NEIGHBORS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

/**
 * Returns the 6 vertex IDs around a hex.
 * Each vertex is identified by the set of hexes it borders.
 * For a hex at (q,r), vertex i is at the junction of:
 *   hex(q,r), neighbor[i], neighbor[(i+1)%6]
 */
function hexVertices(hex: HexCoord): string[] {
  const vertices: string[] = [];
  for (let i = 0; i < 6; i++) {
    const n1 = { q: hex.q + HEX_NEIGHBORS[i].q, r: hex.r + HEX_NEIGHBORS[i].r };
    const n2 = { q: hex.q + HEX_NEIGHBORS[(i + 1) % 6].q, r: hex.r + HEX_NEIGHBORS[(i + 1) % 6].r };
    // Use all three for unique ID (even if neighbor hex doesn't exist on board)
    vertices.push(vertexId([hex, n1, n2]));
  }
  return vertices;
}

/**
 * Returns the 6 edges around a hex.
 * Each edge connects two adjacent vertices.
 */
function hexEdges(hex: HexCoord): string[] {
  const verts = hexVertices(hex);
  const edges: string[] = [];
  for (let i = 0; i < 6; i++) {
    edges.push(edgeId(verts[i], verts[(i + 1) % 6]));
  }
  return edges;
}

// ============================================================
// Port definitions (standard Catan layout)
// ============================================================

// Ports are on specific edges of the outer ring.
// Each port maps to two vertex positions (the endpoints of a coastal edge).
// We define them by the outer hex index and the edge direction.
interface PortDef {
  hexIndex: number;  // Index into HEX_POSITIONS (ring 2: indices 7-18)
  edgeDir: number;   // Which edge of the hex faces outward (0-5)
  type: PortType;
}

const PORT_DEFS: PortDef[] = [
  { hexIndex: 7, edgeDir: 0, type: 'generic' },
  { hexIndex: 8, edgeDir: 1, type: 'wheat' },
  { hexIndex: 10, edgeDir: 1, type: 'ore' },
  { hexIndex: 11, edgeDir: 2, type: 'generic' },
  { hexIndex: 13, edgeDir: 3, type: 'sheep' },
  { hexIndex: 14, edgeDir: 4, type: 'generic' },
  { hexIndex: 15, edgeDir: 4, type: 'generic' },
  { hexIndex: 17, edgeDir: 5, type: 'wood' },
  { hexIndex: 18, edgeDir: 0, type: 'brick' },
];

// ============================================================
// Board generation
// ============================================================

/**
 * Check if two hexes are adjacent (share an edge).
 */
function areHexesAdjacent(a: HexCoord, b: HexCoord): boolean {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  return HEX_NEIGHBORS.some(n => n.q === dq && n.r === dr);
}

/**
 * Check if placing a 6 or 8 on hex `index` would put it adjacent
 * to another 6 or 8.
 */
function has68Neighbor(hexes: HexTile[], index: number): boolean {
  const hex = hexes[index];
  for (let i = 0; i < hexes.length; i++) {
    if (i === index) continue;
    const other = hexes[i];
    if ((other.numberToken === 6 || other.numberToken === 8) &&
        areHexesAdjacent(hex, other)) {
      return true;
    }
  }
  return false;
}

export function generateBoard(seed?: number): { board: Board; rngState: number } {
  let rngState = initRngState(seed);

  // Shuffle resources
  const shuffled = shuffleWithRng(RESOURCE_TILES, rngState);
  const resources = shuffled.result;
  rngState = shuffled.nextState;

  // Create hexes
  const hexes: HexTile[] = HEX_POSITIONS.map((pos, i) => ({
    q: pos.q,
    r: pos.r,
    resource: resources[i],
    numberToken: null,
    hasRobber: resources[i] === 'desert',
  }));

  // Place number tokens on non-desert hexes
  // Try to avoid 6/8 adjacency
  const nonDesertIndices = hexes
    .map((h, i) => (h.resource !== 'desert' ? i : -1))
    .filter(i => i >= 0);

  let tokens = [...NUMBER_TOKENS];
  let attempts = 0;
  let placed = false;

  while (!placed && attempts < 100) {
    const tokenShuffle = shuffleWithRng(NUMBER_TOKENS, rngState);
    tokens = tokenShuffle.result;
    rngState = tokenShuffle.nextState;

    // Reset
    for (const hex of hexes) hex.numberToken = null;

    let valid = true;
    for (let ti = 0; ti < nonDesertIndices.length; ti++) {
      const hexIdx = nonDesertIndices[ti];
      hexes[hexIdx].numberToken = tokens[ti];
      if ((tokens[ti] === 6 || tokens[ti] === 8) && has68Neighbor(hexes, hexIdx)) {
        valid = false;
        break;
      }
    }
    if (valid) placed = true;
    attempts++;
  }

  // If we couldn't avoid 6/8 adjacency after 100 tries, just use the last arrangement
  if (!placed) {
    for (const hex of hexes) hex.numberToken = null;
    for (let ti = 0; ti < nonDesertIndices.length; ti++) {
      hexes[nonDesertIndices[ti]].numberToken = tokens[ti];
    }
  }

  // Build vertex and edge maps (using plain objects / Records)
  const vertices: Record<string, Vertex> = {};
  const edges: Record<string, Edge> = {};
  const hexToVertices: Record<string, string[]> = {};
  const hexToEdges: Record<string, string[]> = {};
  const vertexToHexes: Record<string, string[]> = {};
  const vertexToEdges: Record<string, string[]> = {};
  const vertexToVertices: Record<string, string[]> = {};
  const edgeToVertices: Record<string, [string, string]> = {};
  const edgeToHexes: Record<string, string[]> = {};

  // Generate vertices and edges for each hex
  for (const hex of hexes) {
    const hk = hexKey(hex.q, hex.r);
    const verts = hexVertices(hex);
    const edgs = hexEdges(hex);

    hexToVertices[hk] = verts;
    hexToEdges[hk] = edgs;

    // Register vertices
    for (const vid of verts) {
      if (!vertices[vid]) {
        vertices[vid] = { id: vid, building: null, owner: null };
      }
      // vertex -> hex adjacency
      const vhexes = vertexToHexes[vid] ?? [];
      if (!vhexes.includes(hk)) vhexes.push(hk);
      vertexToHexes[vid] = vhexes;
    }

    // Register edges
    for (let i = 0; i < 6; i++) {
      const eid = edgs[i];
      const v1 = verts[i];
      const v2 = verts[(i + 1) % 6];

      if (!edges[eid]) {
        edges[eid] = { id: eid, road: false, owner: null };
      }

      // edge -> vertex
      if (!edgeToVertices[eid]) {
        edgeToVertices[eid] = [v1, v2];
      }

      // vertex -> edge adjacency
      for (const v of [v1, v2]) {
        const vedges = vertexToEdges[v] ?? [];
        if (!vedges.includes(eid)) vedges.push(eid);
        vertexToEdges[v] = vedges;
      }

      // edge -> hex adjacency
      const ehexes = edgeToHexes[eid] ?? [];
      if (!ehexes.includes(hk)) ehexes.push(hk);
      edgeToHexes[eid] = ehexes;
    }
  }

  // Build vertex -> vertex adjacency (vertices connected by an edge)
  for (const eid of Object.keys(edgeToVertices)) {
    const [v1, v2] = edgeToVertices[eid];
    const v1adj = vertexToVertices[v1] ?? [];
    if (!v1adj.includes(v2)) v1adj.push(v2);
    vertexToVertices[v1] = v1adj;

    const v2adj = vertexToVertices[v2] ?? [];
    if (!v2adj.includes(v1)) v2adj.push(v1);
    vertexToVertices[v2] = v2adj;
  }

  // Generate ports
  const ports: Port[] = PORT_DEFS.map(def => {
    const hex = hexes[def.hexIndex];
    const verts = hexVertices(hex);
    const v1 = verts[def.edgeDir];
    const v2 = verts[(def.edgeDir + 1) % 6];
    return {
      type: def.type,
      vertices: [v1, v2] as [string, string],
      ratio: def.type === 'generic' ? 3 : 2,
    };
  });

  return {
    board: {
      hexes,
      vertices,
      edges,
      ports,
      hexToVertices,
      hexToEdges,
      vertexToHexes,
      vertexToEdges,
      vertexToVertices,
      edgeToVertices,
      edgeToHexes,
    },
    rngState,
  };
}

// ============================================================
// Hex pixel coordinate conversion (for rendering)
// ============================================================

const HEX_SIZE = 60; // pixels — radius of hex

/**
 * Convert axial hex coords to pixel center position (pointy-top hexes).
 */
export function hexToPixel(q: number, r: number, size: number = HEX_SIZE): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/**
 * Generate the 6 corner points of a hex (pointy-top).
 */
export function hexCorners(cx: number, cy: number, size: number = HEX_SIZE): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: cx + size * Math.cos(angle),
      y: cy + size * Math.sin(angle),
    });
  }
  return corners;
}

/**
 * Get pixel position for a vertex.
 * A vertex is at the average of its adjacent hex centers.
 * But more precisely, it's at a corner of the hexes — we compute from the hex corners.
 */
export function vertexPixelPosition(
  vid: string,
  vertexToHexes: Record<string, string[]>,
  size: number = HEX_SIZE
): { x: number; y: number } | null {
  // Parse the hex coords from vertex ID
  // Format: "v:q1,r1|q2,r2|q3,r3"
  const hexParts = vid.slice(2).split('|');
  const hexCoords = hexParts.map(parseHexKey);

  // Convert all hex coords to pixel positions
  const pixelPositions = hexCoords.map(h => hexToPixel(h.q, h.r, size));

  // Average of the three hex centers gives us the vertex position for pointy-top hexes
  const x = pixelPositions.reduce((sum, p) => sum + p.x, 0) / pixelPositions.length;
  const y = pixelPositions.reduce((sum, p) => sum + p.y, 0) / pixelPositions.length;

  return { x, y };
}

/**
 * Get pixel position for the midpoint of an edge.
 */
export function edgePixelPosition(
  eid: string,
  edgeToVertices: Record<string, [string, string]>,
  vertexToHexes: Record<string, string[]>,
  size: number = HEX_SIZE
): { x: number; y: number; angle: number } | null {
  const verts = edgeToVertices[eid];
  if (!verts) return null;

  const p1 = vertexPixelPosition(verts[0], vertexToHexes, size);
  const p2 = vertexPixelPosition(verts[1], vertexToHexes, size);
  if (!p1 || !p2) return null;

  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
  };
}
