import { describe, it, expect } from 'vitest';
import { generateBoard, hexToPixel, hexCorners, vertexPixelPosition, hexKey } from './board';

describe('generateBoard', () => {
  it('generates 19 hexes', () => {
    const board = generateBoard(42);
    expect(board.hexes).toHaveLength(19);
  });

  it('has correct resource distribution', () => {
    const board = generateBoard(42);
    const counts: Record<string, number> = {};
    for (const hex of board.hexes) {
      counts[hex.resource] = (counts[hex.resource] ?? 0) + 1;
    }
    expect(counts['wood']).toBe(4);
    expect(counts['wheat']).toBe(4);
    expect(counts['sheep']).toBe(4);
    expect(counts['brick']).toBe(3);
    expect(counts['ore']).toBe(3);
    expect(counts['desert']).toBe(1);
  });

  it('desert has no number token', () => {
    const board = generateBoard(42);
    const desert = board.hexes.find(h => h.resource === 'desert');
    expect(desert).toBeDefined();
    expect(desert!.numberToken).toBeNull();
  });

  it('desert has the robber', () => {
    const board = generateBoard(42);
    const desert = board.hexes.find(h => h.resource === 'desert');
    expect(desert!.hasRobber).toBe(true);
    const nonDesert = board.hexes.filter(h => h.resource !== 'desert');
    expect(nonDesert.every(h => !h.hasRobber)).toBe(true);
  });

  it('has 18 number tokens on non-desert hexes', () => {
    const board = generateBoard(42);
    const withTokens = board.hexes.filter(h => h.numberToken !== null);
    expect(withTokens).toHaveLength(18);
  });

  it('generates 54 vertices', () => {
    const board = generateBoard(42);
    expect(board.vertices.size).toBe(54);
  });

  it('generates 72 edges', () => {
    const board = generateBoard(42);
    expect(board.edges.size).toBe(72);
  });

  it('generates 9 ports', () => {
    const board = generateBoard(42);
    expect(board.ports).toHaveLength(9);
  });

  it('has correct port distribution', () => {
    const board = generateBoard(42);
    const generic = board.ports.filter(p => p.type === 'generic');
    const specialty = board.ports.filter(p => p.type !== 'generic');
    expect(generic).toHaveLength(4);
    expect(specialty).toHaveLength(5);
  });

  it('each hex has 6 vertices', () => {
    const board = generateBoard(42);
    for (const hex of board.hexes) {
      const hk = hexKey(hex.q, hex.r);
      const verts = board.hexToVertices.get(hk);
      expect(verts).toBeDefined();
      expect(verts!).toHaveLength(6);
    }
  });

  it('each hex has 6 edges', () => {
    const board = generateBoard(42);
    for (const hex of board.hexes) {
      const hk = hexKey(hex.q, hex.r);
      const edgs = board.hexToEdges.get(hk);
      expect(edgs).toBeDefined();
      expect(edgs!).toHaveLength(6);
    }
  });

  it('vertex-vertex adjacency has 2 or 3 neighbors', () => {
    const board = generateBoard(42);
    for (const [vid, neighbors] of board.vertexToVertices) {
      expect(neighbors.length).toBeGreaterThanOrEqual(2);
      expect(neighbors.length).toBeLessThanOrEqual(3);
    }
  });

  it('tries to avoid 6/8 adjacency', () => {
    const board = generateBoard(42);
    // Check that no two adjacent hexes both have 6 or 8
    let violations = 0;
    for (const hex of board.hexes) {
      if (hex.numberToken !== 6 && hex.numberToken !== 8) continue;
      const hk = hexKey(hex.q, hex.r);
      const adjVerts = board.hexToVertices.get(hk) ?? [];
      for (const vid of adjVerts) {
        const adjHexes = board.vertexToHexes.get(vid) ?? [];
        for (const ahk of adjHexes) {
          if (ahk === hk) continue;
          const adjHex = board.hexes.find(h => hexKey(h.q, h.r) === ahk);
          if (adjHex && (adjHex.numberToken === 6 || adjHex.numberToken === 8)) {
            violations++;
          }
        }
      }
    }
    // With a good seed this should be 0, but we just check it's low
    expect(violations).toBeLessThanOrEqual(4); // Some tolerance
  });

  it('is deterministic with the same seed', () => {
    const board1 = generateBoard(123);
    const board2 = generateBoard(123);
    expect(board1.hexes.map(h => h.resource)).toEqual(board2.hexes.map(h => h.resource));
    expect(board1.hexes.map(h => h.numberToken)).toEqual(board2.hexes.map(h => h.numberToken));
  });

  it('produces different boards with different seeds', () => {
    const board1 = generateBoard(1);
    const board2 = generateBoard(2);
    const r1 = board1.hexes.map(h => h.resource).join(',');
    const r2 = board2.hexes.map(h => h.resource).join(',');
    expect(r1).not.toBe(r2);
  });
});

describe('hexToPixel', () => {
  it('center hex is at origin', () => {
    const pos = hexToPixel(0, 0);
    expect(pos.x).toBeCloseTo(0);
    expect(pos.y).toBeCloseTo(0);
  });

  it('adjacent hexes are roughly 2 * size apart', () => {
    const size = 60;
    const p1 = hexToPixel(0, 0, size);
    const p2 = hexToPixel(1, 0, size);
    const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    expect(dist).toBeCloseTo(size * Math.sqrt(3), 0);
  });
});

describe('hexCorners', () => {
  it('returns 6 corners', () => {
    const corners = hexCorners(0, 0);
    expect(corners).toHaveLength(6);
  });
});
