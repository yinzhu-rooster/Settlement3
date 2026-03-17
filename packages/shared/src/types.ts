// ============================================================
// Core Types — Settlement3 Game Engine
// ============================================================

export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';

export const ALL_RESOURCES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export interface GameConfig {
  maxPlayers: 3 | 4;
  turnTimerSeconds: number;
  friendlyRobber: boolean;
  speedMode: boolean;
  discardThreshold: number;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxPlayers: 4,
  turnTimerSeconds: 90,
  friendlyRobber: false,
  speedMode: false,
  discardThreshold: 7,
};

// ============================================================
// Board
// ============================================================

export interface HexCoord {
  q: number;
  r: number;
}

export interface HexTile {
  q: number;
  r: number;
  resource: Resource | 'desert';
  numberToken: number | null;
  hasRobber: boolean;
}

export type BuildingType = 'settlement' | 'city';

export interface Vertex {
  id: string;
  building: BuildingType | null;
  owner: number | null;
}

export interface Edge {
  id: string;
  road: boolean;
  owner: number | null;
}

export type PortType = Resource | 'generic';

export interface Port {
  type: PortType;
  vertices: [string, string];
  ratio: number; // 2 for specialty, 3 for generic
}

export interface Board {
  hexes: HexTile[];
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
  ports: Port[];
  // Adjacency maps
  hexToVertices: Map<string, string[]>;
  hexToEdges: Map<string, string[]>;
  vertexToHexes: Map<string, string[]>;
  vertexToEdges: Map<string, string[]>;
  vertexToVertices: Map<string, string[]>;
  edgeToVertices: Map<string, [string, string]>;
  edgeToHexes: Map<string, string[]>;
}

// ============================================================
// Player
// ============================================================

export interface PlayerState {
  id: number; // 0-3
  name: string;
  color: PlayerColor;
  resources: Record<Resource, number>;
  devCards: DevCard[];
  devCardsPlayedThisTurn: number;
  knightsPlayed: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  longestRoadLength: number;
  // Building supply
  settlementsRemaining: number;
  citiesRemaining: number;
  roadsRemaining: number;
  // Ports this player has access to
  ports: PortType[];
  // VP cards are always counted
  victoryPoints: number;
}

export type PlayerColor = 'red' | 'blue' | 'white' | 'orange';

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'white', 'orange'];

// ============================================================
// Dev Cards
// ============================================================

export type DevCardType = 'knight' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';

export interface DevCard {
  type: DevCardType;
  turnBought: number;
}

// ============================================================
// Trade
// ============================================================

export interface TradeOffer {
  id: string;
  fromPlayer: number;
  toPlayer: number | null; // null = offered to all
  offering: Partial<Record<Resource, number>>;
  requesting: Partial<Record<Resource, number>>;
  status: 'open' | 'accepted' | 'rejected' | 'cancelled';
  respondedBy: Map<number, 'accepted' | 'rejected'>;
}

// ============================================================
// Game State
// ============================================================

export type GamePhase =
  | 'setup_1'      // Forward placement: P1 → P2 → P3 → P4
  | 'setup_2'      // Reverse placement: P4 → P3 → P2 → P1
  | 'main'         // Normal play
  | 'finished';

export type TurnPhase =
  | 'setup_settlement' // Must place settlement
  | 'setup_road'       // Must place road (after settlement)
  | 'pre_roll'         // Can play dev card, then must roll
  | 'post_roll'        // Can trade, build, play dev card, or end turn
  | 'robber_discard'   // Waiting for players to discard (7 rolled)
  | 'robber_move'      // Must move the robber
  | 'robber_steal'     // Must choose who to steal from
  | 'road_building_1'  // Place first free road (dev card)
  | 'road_building_2'  // Place second free road (dev card)
  | 'year_of_plenty'   // Choose 2 resources from bank
  | 'monopoly';        // Choose a resource type

export interface GameState {
  config: GameConfig;
  board: Board;
  players: PlayerState[];
  currentPlayerIndex: number;
  gamePhase: GamePhase;
  turnPhase: TurnPhase;
  turnNumber: number;
  diceRoll: [number, number] | null;
  devCardDeck: DevCardType[];
  activeTrades: Map<string, TradeOffer>;
  // Discard tracking
  playersNeedingToDiscard: Set<number>;
  // Robber steal choices
  robberStealTargets: number[];
  // Winner
  winner: number | null;
  // Last error for UI feedback
  lastError: string | null;
  // State history for undo (local play only)
  history: GameState[];
  // Setup tracking
  setupRound: number;
}

// ============================================================
// Actions
// ============================================================

export type GameAction =
  | { type: 'ROLL_DICE' }
  | { type: 'PLACE_SETTLEMENT'; vertexId: string }
  | { type: 'PLACE_CITY'; vertexId: string }
  | { type: 'PLACE_ROAD'; edgeId: string }
  | { type: 'BUY_DEV_CARD' }
  | { type: 'PLAY_DEV_CARD'; cardType: DevCardType }
  | { type: 'MOVE_ROBBER'; hexQ: number; hexR: number }
  | { type: 'ROBBER_STEAL'; targetPlayer: number }
  | { type: 'DISCARD_RESOURCES'; resources: Partial<Record<Resource, number>> }
  | { type: 'TRADE_OFFER'; toPlayer: number | null; offering: Partial<Record<Resource, number>>; requesting: Partial<Record<Resource, number>> }
  | { type: 'TRADE_ACCEPT'; tradeId: string }
  | { type: 'TRADE_REJECT'; tradeId: string }
  | { type: 'TRADE_COUNTER'; tradeId: string; offering: Partial<Record<Resource, number>>; requesting: Partial<Record<Resource, number>> }
  | { type: 'TRADE_CANCEL'; tradeId: string }
  | { type: 'BANK_TRADE'; giving: Resource; receiving: Resource }
  | { type: 'YEAR_OF_PLENTY_PICK'; resources: [Resource, Resource] }
  | { type: 'MONOPOLY_PICK'; resource: Resource }
  | { type: 'END_TURN' }
  | { type: 'UNDO' };

export type ActionResult =
  | { success: true; state: GameState }
  | { success: false; error: string };

// ============================================================
// Constants
// ============================================================

export const BUILDING_COSTS: Record<string, Partial<Record<Resource, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

export const BUILDING_LIMITS = {
  settlement: 5,
  city: 4,
  road: 15,
} as const;

export const DEV_CARD_COUNTS: Record<DevCardType, number> = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};
