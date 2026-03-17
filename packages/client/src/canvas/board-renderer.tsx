import { useRef, useEffect, useState, useCallback } from 'react';
import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import type { GameState, GameAction, ActionResult, HexTile, Resource, PlayerColor } from '@settlement3/shared';
import { hexToPixel, hexCorners, vertexPixelPosition, hexKey } from '@settlement3/shared';
import { useGameState, useDispatch } from '../hooks/use-game';
import { useBuildMode, type BuildMode } from '../hooks/use-build-mode';
import {
  getValidSettlementVertices,
  getValidRoadEdges,
  getValidCityVertices,
} from '@settlement3/shared';

// Pan & zoom constants
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_SENSITIVITY = 0.001;
const PAN_DRAG_THRESHOLD = 4; // pixels moved before we consider it a drag (not a click)

const HEX_SIZE = 60;

const RESOURCE_COLORS: Record<Resource | 'desert', number> = {
  wood: 0x2d8a4e,
  brick: 0xc0392b,
  sheep: 0x7dcea0,
  wheat: 0xf4d03f,
  ore: 0x7f8c8d,
  desert: 0xd4a574,
};

const PLAYER_HEX_COLORS: Record<PlayerColor, number> = {
  red: 0xe74c3c,
  blue: 0x3498db,
  white: 0xecf0f1,
  orange: 0xe67e22,
};

interface BoardRendererProps {
  width: number;
  height: number;
}

// TODO (Issue #9): Full re-render every state change. Consider diffing state
// and only updating changed elements, or using a more granular subscription model.
export function BoardRenderer({ width, height }: BoardRendererProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [ready, setReady] = useState(false);
  const gameState = useGameState();
  const dispatchAction = useDispatch();
  const { buildMode, setBuildMode } = useBuildMode();

  // Persistent pan/zoom state across re-renders
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  // Ref to the board container so we can update transforms without re-rendering
  const boardContainerRef = useRef<Container | null>(null);

  // Apply current pan/zoom to the board container
  const applyTransform = useCallback(() => {
    const container = boardContainerRef.current;
    if (!container) return;
    container.x = width / 2 + panRef.current.x;
    container.y = height / 2 + panRef.current.y;
    container.scale.set(zoomRef.current);
  }, [width, height]);

  // Initialize PixiJS — only once
  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    let cancelled = false;
    const app = new Application();

    app.init({
      width,
      height,
      background: 0x1a3a5c,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (cancelled) { app.destroy(true); return; }
      container.appendChild(app.canvas);
      appRef.current = app;
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
      setReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize canvas when window resizes
  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;
    app.renderer.resize(width, height);
    // Re-apply transform since width/height changed the center offset
    applyTransform();
  }, [width, height, ready, applyTransform]);

  // Pan & zoom event listeners — attached once when app is ready
  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;

    const canvas = app.canvas as HTMLCanvasElement;

    // --- Pointer (mouse/touch) pan state ---
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;
    let totalDragDistance = 0;

    // --- Pinch-to-zoom state ---
    const activePointers = new Map<number, { x: number; y: number }>();

    function getPointerDistance(): number {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return 0;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function getPointerCenter(): { x: number; y: number } {
      const pts = Array.from(activePointers.values());
      if (pts.length < 2) return { x: 0, y: 0 };
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    }

    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    function onPointerDown(e: PointerEvent) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1) {
        // Start potential pan
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartOffsetX = panRef.current.x;
        panStartOffsetY = panRef.current.y;
        totalDragDistance = 0;
      } else if (activePointers.size === 2) {
        // Switch from pan to pinch
        isPanning = false;
        pinchStartDist = getPointerDistance();
        pinchStartZoom = zoomRef.current;
      }
    }

    function onPointerMove(e: PointerEvent) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 2) {
        // Pinch-to-zoom
        const dist = getPointerDistance();
        if (pinchStartDist > 0) {
          const center = getPointerCenter();
          const rect = canvas.getBoundingClientRect();
          const cx = center.x - rect.left;
          const cy = center.y - rect.top;

          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom * (dist / pinchStartDist)));
          zoomToPoint(cx, cy, newZoom);
        }
      } else if (isPanning && activePointers.size === 1) {
        // Pan
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        totalDragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
        panRef.current.x = panStartOffsetX + dx;
        panRef.current.y = panStartOffsetY + dy;
        applyTransform();
      }
    }

    function onPointerUp(e: PointerEvent) {
      activePointers.delete(e.pointerId);

      if (activePointers.size < 2) {
        pinchStartDist = 0;
      }
      if (activePointers.size === 0) {
        isPanning = false;
      }
      // If remaining single pointer, re-anchor pan from its position
      if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        isPanning = true;
        panStartX = remaining.x;
        panStartY = remaining.y;
        panStartOffsetX = panRef.current.x;
        panStartOffsetY = panRef.current.y;
        totalDragDistance = 0;
      }
    }

    function zoomToPoint(screenX: number, screenY: number, newZoom: number) {
      const oldZoom = zoomRef.current;
      // The board container pivot is at (0,0), positioned at (width/2 + panX, height/2 + panY)
      // Screen point maps to world point: worldX = (screenX - containerX) / oldZoom
      const containerX = width / 2 + panRef.current.x;
      const containerY = height / 2 + panRef.current.y;
      const worldX = (screenX - containerX) / oldZoom;
      const worldY = (screenY - containerY) / oldZoom;

      // After zoom, the same world point should be under the same screen point:
      // screenX = (width/2 + newPanX) + worldX * newZoom
      // newPanX = screenX - width/2 - worldX * newZoom
      panRef.current.x = screenX - width / 2 - worldX * newZoom;
      panRef.current.y = screenY - height / 2 - worldY * newZoom;
      zoomRef.current = newZoom;
      applyTransform();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current * (1 + zoomDelta)));
      zoomToPoint(mouseX, mouseY, newZoom);
    }

    // Suppress click events on the canvas if the user was dragging (prevents
    // accidental settlement/road placement after panning). We capture the click
    // before PixiJS sees it.
    function onClickCapture(e: MouseEvent) {
      if (totalDragDistance > PAN_DRAG_THRESHOLD) {
        e.stopPropagation();
        e.preventDefault();
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('click', onClickCapture, true);

    // Prevent default touch behavior (scroll, zoom) on the canvas
    function preventTouchDefault(e: TouchEvent) { e.preventDefault(); }
    canvas.addEventListener('touchstart', preventTouchDefault, { passive: false });
    canvas.addEventListener('touchmove', preventTouchDefault, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClickCapture, true);
      canvas.removeEventListener('touchstart', preventTouchDefault);
      canvas.removeEventListener('touchmove', preventTouchDefault);
    };
  }, [ready, width, height, applyTransform]);

  // Render board whenever state changes or app becomes ready
  useEffect(() => {
    const app = appRef.current;
    if (!app || !ready) return;

    const container = renderBoard(app, gameState, dispatchAction, width, height, buildMode, setBuildMode);
    boardContainerRef.current = container;
    applyTransform();
  }, [gameState, ready, width, height, dispatchAction, buildMode, setBuildMode, applyTransform]);

  return (
    <div className="relative" style={{ width, height }}>
      <div ref={canvasRef} style={{ width, height }} className="cursor-grab active:cursor-grabbing" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-[#1a3a5c]">
          Loading board...
        </div>
      )}
    </div>
  );
}

// ============================================================
// Rendering
// ============================================================

type DispatchFn = (action: GameAction, player?: number) => ActionResult;

function renderBoard(
  app: Application,
  state: GameState,
  dispatchAction: DispatchFn,
  width: number,
  height: number,
  buildMode: BuildMode,
  setBuildMode: (mode: BuildMode) => void
): Container {
  const { turnPhase } = state;

  // Determine interaction mode from game state + build mode
  let interactionMode: string = 'none';
  if (turnPhase === 'setup_settlement') interactionMode = 'place_settlement';
  else if (turnPhase === 'setup_road') interactionMode = 'place_road';
  else if (turnPhase === 'robber_move') interactionMode = 'move_robber';
  else if (turnPhase === 'road_building_1' || turnPhase === 'road_building_2') interactionMode = 'place_road';
  else if (turnPhase === 'post_roll' && buildMode === 'settlement') interactionMode = 'place_settlement';
  else if (turnPhase === 'post_roll' && buildMode === 'road') interactionMode = 'place_road';
  else if (turnPhase === 'post_roll' && buildMode === 'city') interactionMode = 'place_city';

  // Wrap dispatch to clear build mode after successful placement
  const wrappedDispatch: DispatchFn = (action, player?) => {
    const result = dispatchAction(action, player);
    if (result.success && (
      action.type === 'PLACE_SETTLEMENT' ||
      action.type === 'PLACE_ROAD' ||
      action.type === 'PLACE_CITY'
    )) {
      setBuildMode(null);
    }
    return result;
  };

  // Clear previous render — destroy Graphics objects to prevent memory leaks
  for (const child of app.stage.children) {
    child.destroy({ children: true });
  }
  app.stage.removeChildren();

  const boardContainer = new Container();
  // Position and scale are applied by applyTransform() after this function returns.
  // Default position (width/2, height/2) is set there along with pan offset and zoom.
  boardContainer.eventMode = 'static';
  app.stage.addChild(boardContainer);

  // Draw hexes
  for (const hex of state.board.hexes) {
    drawHex(boardContainer, hex, state, wrappedDispatch, interactionMode);
  }

  // Draw ports
  drawPorts(boardContainer, state);

  // Draw edges (roads) — draw BEFORE vertices so vertices render on top
  drawEdges(boardContainer, state, wrappedDispatch, interactionMode);

  // Draw vertices (settlements/cities)
  drawVertices(boardContainer, state, wrappedDispatch, interactionMode);

  return boardContainer;
}

function drawHex(
  container: Container,
  hex: HexTile,
  state: GameState,
  dispatchAction: DispatchFn,
  interactionMode: string
) {
  const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
  const corners = hexCorners(x, y, HEX_SIZE);
  const color = RESOURCE_COLORS[hex.resource];

  // Main hex
  const g = new Graphics();
  g.poly(corners.flatMap(c => [c.x, c.y]));
  g.fill({ color });
  g.stroke({ color: 0x5d4e37, width: 2, alpha: 0.6 });
  container.addChild(g);

  // Robber
  if (hex.hasRobber) {
    const robber = new Graphics();
    robber.circle(x, y, 12);
    robber.fill({ color: 0x1a1a1a, alpha: 0.9 });
    // White "R" on top
    const rText = new Text({ text: 'R', style: new TextStyle({ fontSize: 12, fill: 0xffffff, fontWeight: 'bold', fontFamily: 'Inter' }) });
    rText.anchor.set(0.5, 0.5);
    rText.x = x;
    rText.y = y;
    container.addChild(robber);
    container.addChild(rText);
  }

  // Robber placement highlight
  if (interactionMode === 'move_robber' && !hex.hasRobber) {
    const overlay = new Graphics();
    overlay.poly(corners.flatMap(c => [c.x, c.y]));
    overlay.fill({ color: 0xff4444, alpha: 0.15 });
    overlay.eventMode = 'static';
    overlay.cursor = 'pointer';
    overlay.on('pointerdown', () => {
      dispatchAction({ type: 'MOVE_ROBBER', hexQ: hex.q, hexR: hex.r });
    });
    overlay.on('pointerenter', () => {
      overlay.clear();
      overlay.poly(corners.flatMap(c => [c.x, c.y]));
      overlay.fill({ color: 0xff4444, alpha: 0.3 });
    });
    overlay.on('pointerleave', () => {
      overlay.clear();
      overlay.poly(corners.flatMap(c => [c.x, c.y]));
      overlay.fill({ color: 0xff4444, alpha: 0.15 });
    });
    container.addChild(overlay);
  }

  // Number token
  if (hex.numberToken !== null) {
    const tokenBg = new Graphics();
    tokenBg.circle(x, y, 18);
    tokenBg.fill({ color: 0xfaf3e0 });
    tokenBg.stroke({ color: 0x5d4e37, width: 1.5 });
    container.addChild(tokenBg);

    const isRed = hex.numberToken === 6 || hex.numberToken === 8;
    const numText = new Text({
      text: String(hex.numberToken),
      style: new TextStyle({
        fontSize: 16,
        fontWeight: 'bold',
        fill: isRed ? 0xc0392b : 0x2c3e50,
        fontFamily: 'Inter',
      }),
    });
    numText.anchor.set(0.5, 0.5);
    numText.x = x;
    numText.y = y;
    container.addChild(numText);

    // Probability dots
    const dots = 6 - Math.abs(7 - hex.numberToken);
    const dotG = new Graphics();
    const dotStartX = x - (dots - 1) * 3;
    for (let i = 0; i < dots; i++) {
      dotG.circle(dotStartX + i * 6, y + 14, 1.5);
      dotG.fill({ color: isRed ? 0xc0392b : 0x2c3e50 });
    }
    container.addChild(dotG);
  }

  // Resource label (below number token or centered for desert)
  const labelText = hex.resource === 'desert' ? 'DESERT' : hex.resource.toUpperCase();
  const label = new Text({
    text: labelText,
    style: new TextStyle({
      fontSize: 9,
      fill: 0xffffff,
      fontFamily: 'Inter',
      fontWeight: '600',
    }),
  });
  label.anchor.set(0.5, 0.5);
  label.x = x;
  label.y = y + (hex.numberToken !== null ? 30 : 0);
  label.alpha = 0.7;
  container.addChild(label);
}

function drawPorts(container: Container, state: GameState) {
  for (const port of state.board.ports) {
    const p1 = vertexPixelPosition(port.vertices[0], state.board.vertexToHexes, HEX_SIZE);
    const p2 = vertexPixelPosition(port.vertices[1], state.board.vertexToHexes, HEX_SIZE);
    if (!p1 || !p2) continue;

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;

    const g = new Graphics();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke({ color: 0xf5e6ca, width: 3, alpha: 0.6 });
    container.addChild(g);

    const labelStr = port.type === 'generic' ? '3:1' : `2:1 ${port.type}`;
    const text = new Text({
      text: labelStr,
      style: new TextStyle({ fontSize: 8, fill: 0xf5e6ca, fontFamily: 'Inter', fontWeight: '600' }),
    });
    text.anchor.set(0.5, 0.5);
    const dist = Math.sqrt(mx * mx + my * my) || 1;
    text.x = mx + (mx / dist) * 20;
    text.y = my + (my / dist) * 20;
    container.addChild(text);
  }
}

function drawEdges(
  container: Container,
  state: GameState,
  dispatchAction: DispatchFn,
  interactionMode: string
) {
  const currentPlayer = state.currentPlayerIndex;
  const validRoads = interactionMode === 'place_road'
    ? new Set(getValidRoadEdges(state, currentPlayer))
    : new Set<string>();

  for (const eid of Object.keys(state.board.edges)) {
    const edge = state.board.edges[eid];
    const verts = state.board.edgeToVertices[eid];
    if (!verts) continue;
    const p1 = vertexPixelPosition(verts[0], state.board.vertexToHexes, HEX_SIZE);
    const p2 = vertexPixelPosition(verts[1], state.board.vertexToHexes, HEX_SIZE);
    if (!p1 || !p2) continue;

    if (edge.road && edge.owner !== null) {
      const color = PLAYER_HEX_COLORS[state.players[edge.owner].color];
      // Shadow
      const shadow = new Graphics();
      shadow.moveTo(p1.x, p1.y);
      shadow.lineTo(p2.x, p2.y);
      shadow.stroke({ color: 0x000000, width: 8, alpha: 0.3 });
      container.addChild(shadow);
      // Road
      const road = new Graphics();
      road.moveTo(p1.x, p1.y);
      road.lineTo(p2.x, p2.y);
      road.stroke({ color, width: 5 });
      container.addChild(road);
    } else if (validRoads.has(eid)) {
      const color = PLAYER_HEX_COLORS[state.players[currentPlayer].color];
      const ghost = new Graphics();
      ghost.moveTo(p1.x, p1.y);
      ghost.lineTo(p2.x, p2.y);
      ghost.stroke({ color, width: 4, alpha: 0.25 });
      container.addChild(ghost);

      // Clickable hit area
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const hitArea = new Graphics();
      hitArea.rect(mx - 15, my - 15, 30, 30);
      hitArea.fill({ color: 0xffffff, alpha: 0.001 });
      hitArea.eventMode = 'static';
      hitArea.cursor = 'pointer';
      hitArea.on('pointerdown', () => {
        dispatchAction({ type: 'PLACE_ROAD', edgeId: eid });
      });
      hitArea.on('pointerenter', () => {
        ghost.clear();
        ghost.moveTo(p1.x, p1.y);
        ghost.lineTo(p2.x, p2.y);
        ghost.stroke({ color, width: 5, alpha: 0.6 });
      });
      hitArea.on('pointerleave', () => {
        ghost.clear();
        ghost.moveTo(p1.x, p1.y);
        ghost.lineTo(p2.x, p2.y);
        ghost.stroke({ color, width: 4, alpha: 0.25 });
      });
      container.addChild(hitArea);
    }
  }
}

function drawVertices(
  container: Container,
  state: GameState,
  dispatchAction: DispatchFn,
  interactionMode: string
) {
  const currentPlayer = state.currentPlayerIndex;
  const validSettlements = interactionMode === 'place_settlement'
    ? new Set(getValidSettlementVertices(state, currentPlayer))
    : new Set<string>();
  const validCities = interactionMode === 'place_city'
    ? new Set(getValidCityVertices(state, currentPlayer))
    : new Set<string>();

  for (const vid of Object.keys(state.board.vertices)) {
    const vertex = state.board.vertices[vid];
    const pos = vertexPixelPosition(vid, state.board.vertexToHexes, HEX_SIZE);
    if (!pos) continue;

    if (vertex.building === 'settlement' && vertex.owner !== null) {
      const color = PLAYER_HEX_COLORS[state.players[vertex.owner].color];
      const s = 8;
      const g = new Graphics();
      // House shape
      g.moveTo(pos.x, pos.y - s * 1.3);
      g.lineTo(pos.x + s, pos.y - s * 0.3);
      g.lineTo(pos.x + s, pos.y + s * 0.7);
      g.lineTo(pos.x - s, pos.y + s * 0.7);
      g.lineTo(pos.x - s, pos.y - s * 0.3);
      g.closePath();
      g.fill({ color });
      g.stroke({ color: 0x2c3e50, width: 1.5 });
      container.addChild(g);
    } else if (vertex.building === 'city' && vertex.owner !== null) {
      const color = PLAYER_HEX_COLORS[state.players[vertex.owner].color];
      const s = 10;
      const g = new Graphics();
      g.rect(pos.x - s, pos.y - s * 0.5, s * 2, s * 1.2);
      g.fill({ color });
      g.stroke({ color: 0x2c3e50, width: 1.5 });
      g.rect(pos.x - s * 0.3, pos.y - s * 1.2, s * 0.6, s * 0.7);
      g.fill({ color });
      g.stroke({ color: 0x2c3e50, width: 1.5 });
      container.addChild(g);
    } else if (validSettlements.has(vid)) {
      const color = PLAYER_HEX_COLORS[state.players[currentPlayer].color];
      const ghost = new Graphics();
      ghost.circle(pos.x, pos.y, 8);
      ghost.fill({ color, alpha: 0.3 });
      ghost.stroke({ color, width: 1.5, alpha: 0.5 });
      ghost.eventMode = 'static';
      ghost.cursor = 'pointer';
      ghost.hitArea = { contains: (x: number, y: number) => {
        return (x - pos.x) ** 2 + (y - pos.y) ** 2 < 196;
      }};
      ghost.on('pointerdown', () => {
        dispatchAction({ type: 'PLACE_SETTLEMENT', vertexId: vid });
      });
      ghost.on('pointerenter', () => {
        ghost.clear();
        ghost.circle(pos.x, pos.y, 9);
        ghost.fill({ color, alpha: 0.6 });
        ghost.stroke({ color: 0xffffff, width: 2, alpha: 0.8 });
      });
      ghost.on('pointerleave', () => {
        ghost.clear();
        ghost.circle(pos.x, pos.y, 8);
        ghost.fill({ color, alpha: 0.3 });
        ghost.stroke({ color, width: 1.5, alpha: 0.5 });
      });
      container.addChild(ghost);
    } else if (validCities.has(vid)) {
      // City upgrade indicator — pulsing ring around existing settlement
      const color = PLAYER_HEX_COLORS[state.players[currentPlayer].color];
      const ghost = new Graphics();
      ghost.circle(pos.x, pos.y, 12);
      ghost.fill({ color: 0x000000, alpha: 0.001 });
      ghost.stroke({ color: 0xf1c40f, width: 2.5, alpha: 0.6 });
      ghost.eventMode = 'static';
      ghost.cursor = 'pointer';
      ghost.hitArea = { contains: (x: number, y: number) => {
        return (x - pos.x) ** 2 + (y - pos.y) ** 2 < 225;
      }};
      ghost.on('pointerdown', () => {
        dispatchAction({ type: 'PLACE_CITY', vertexId: vid });
      });
      ghost.on('pointerenter', () => {
        ghost.clear();
        ghost.circle(pos.x, pos.y, 13);
        ghost.fill({ color: 0x000000, alpha: 0.001 });
        ghost.stroke({ color: 0xf1c40f, width: 3, alpha: 0.9 });
      });
      ghost.on('pointerleave', () => {
        ghost.clear();
        ghost.circle(pos.x, pos.y, 12);
        ghost.fill({ color: 0x000000, alpha: 0.001 });
        ghost.stroke({ color: 0xf1c40f, width: 2.5, alpha: 0.6 });
      });
      container.addChild(ghost);
    }
  }
}
