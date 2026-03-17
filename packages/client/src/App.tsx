import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import { GameServiceContext, PlayerIndexContext } from './hooks/use-game';
import { BuildModeContext, type BuildMode } from './hooks/use-build-mode';
import { LocalGameService } from './services/local-game-service';
import { OnlineGameService, type ConnectionStatus } from './services/online-game-service';
import { BoardRenderer } from './canvas/board-renderer';
import { TopBar } from './ui/top-bar';
import { ActionBar } from './ui/action-bar';
import { VictoryScreen } from './ui/victory-screen';
import type { GameService } from './services/game-service';

const SERVER_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-950 text-white p-8">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <pre className="text-sm text-red-300 bg-red-900/50 p-4 rounded-lg max-w-2xl overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="mt-4 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen =
  | 'menu'
  | 'lobby-create'
  | 'lobby-join'
  | 'connecting'
  | 'waiting'
  | 'game';

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [gameService, setGameService] = useState<GameService | null>(null);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);

  // Keep track of online service for status subscription
  const onlineServiceRef = useRef<OnlineGameService | null>(null);

  // Subscribe to connection status changes
  useEffect(() => {
    const service = onlineServiceRef.current;
    if (!service) return;
    const unsub = service.subscribeStatus((status) => {
      setConnectionStatus(status);
      if (status === 'error') {
        setConnectionError(service.getError() ?? 'Connection lost');
      }
    });
    return unsub;
  }, [gameService]);

  // ------------------------------------------------------------------
  // Local game
  // ------------------------------------------------------------------

  function startLocalGame(playerCount: 3 | 4) {
    try {
      const service = new LocalGameService({ maxPlayers: playerCount });
      onlineServiceRef.current = null;
      setGameService(service);
      setPlayerIndex(null); // local hot-seat — uses currentPlayerIndex
      setBuildMode(null);
      setConnectionError(null);
      setScreen('game');
    } catch (e) {
      console.error('Failed to create game service:', e);
    }
  }

  // ------------------------------------------------------------------
  // Online game — create
  // ------------------------------------------------------------------

  async function createOnlineGame(playerCount: 3 | 4, displayName: string) {
    setScreen('connecting');
    setConnectionError(null);
    try {
      const service = await OnlineGameService.create(SERVER_URL, {
        maxPlayers: playerCount,
        displayName,
      });
      onlineServiceRef.current = service;
      setGameService(service);
      setPlayerIndex(service.getPlayerIndex());
      setBuildMode(null);
      setScreen('waiting');

      // Listen for state changes — when game starts (setup phase), move to game screen
      service.subscribe((state) => {
        if (state.gamePhase !== 'finished') {
          setScreen('game');
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create game';
      setConnectionError(msg);
      setScreen('menu');
    }
  }

  // ------------------------------------------------------------------
  // Online game — join
  // ------------------------------------------------------------------

  async function joinOnlineGame(roomCode: string, displayName: string) {
    setScreen('connecting');
    setConnectionError(null);
    try {
      const service = await OnlineGameService.joinByCode(SERVER_URL, roomCode, displayName);
      onlineServiceRef.current = service;
      setGameService(service);
      setPlayerIndex(service.getPlayerIndex());
      setBuildMode(null);
      setScreen('game');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to join game';
      setConnectionError(msg);
      setScreen('lobby-join');
    }
  }

  // ------------------------------------------------------------------
  // Back to menu
  // ------------------------------------------------------------------

  function backToMenu() {
    if (onlineServiceRef.current) {
      onlineServiceRef.current.disconnect();
      onlineServiceRef.current = null;
    }
    setGameService(null);
    setPlayerIndex(null);
    setBuildMode(null);
    setConnectionError(null);
    setScreen('menu');
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (screen === 'menu') {
    return (
      <MainMenu
        onStartLocal={startLocalGame}
        onCreateOnline={() => setScreen('lobby-create')}
        onJoinOnline={() => setScreen('lobby-join')}
        error={connectionError}
      />
    );
  }

  if (screen === 'lobby-create') {
    return (
      <CreateLobby
        onBack={backToMenu}
        onCreate={createOnlineGame}
      />
    );
  }

  if (screen === 'lobby-join') {
    return (
      <JoinLobby
        onBack={backToMenu}
        onJoin={joinOnlineGame}
        error={connectionError}
      />
    );
  }

  if (screen === 'connecting') {
    return <ConnectingScreen />;
  }

  if (screen === 'waiting' && onlineServiceRef.current) {
    return (
      <WaitingScreen
        roomId={onlineServiceRef.current.getRoomId()}
        onCancel={backToMenu}
      />
    );
  }

  if (!gameService) return null;

  // Reconnecting overlay
  const showReconnecting = connectionStatus === 'reconnecting';
  const showDisconnected = connectionStatus === 'error' || connectionStatus === 'disconnected';

  return (
    <ErrorBoundary>
      <GameServiceContext.Provider value={gameService}>
        <PlayerIndexContext.Provider value={playerIndex}>
          <BuildModeContext.Provider value={{ buildMode, setBuildMode }}>
            <div className="relative w-full h-full">
              <TopBar />
              <GameBoard />
              <ActionBar />
              <VictoryScreen onNewGame={backToMenu} />

              {showReconnecting && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-stone-900 rounded-xl p-6 text-center border border-white/10">
                    <div className="text-white font-medium mb-2">Reconnecting...</div>
                    <div className="text-stone-400 text-sm">Attempting to rejoin the game</div>
                  </div>
                </div>
              )}

              {showDisconnected && onlineServiceRef.current && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-stone-900 rounded-xl p-6 text-center border border-white/10 w-80">
                    <div className="text-red-400 font-medium mb-2">Disconnected</div>
                    <div className="text-stone-400 text-sm mb-4">
                      {connectionError ?? 'Lost connection to the game server.'}
                    </div>
                    <button
                      onClick={backToMenu}
                      className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-lg text-sm transition-colors"
                    >
                      Back to Menu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </BuildModeContext.Provider>
        </PlayerIndexContext.Provider>
      </GameServiceContext.Provider>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Game Board (unchanged)
// ---------------------------------------------------------------------------

function GameBoard() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    function onResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return <BoardRenderer width={size.width} height={size.height} />;
}

// ---------------------------------------------------------------------------
// Main Menu
// ---------------------------------------------------------------------------

function MainMenu({
  onStartLocal,
  onCreateOnline,
  onJoinOnline,
  error,
}: {
  onStartLocal: (players: 3 | 4) => void;
  onCreateOnline: () => void;
  onJoinOnline: () => void;
  error: string | null;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <h1 className="text-5xl font-bold text-amber-100 mb-2" style={{ fontFamily: 'Playfair Display' }}>
        Settlement3
      </h1>
      <p className="text-stone-400 mb-10 text-sm">A game of trading and building</p>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/60 border border-red-700/50 rounded-lg text-red-300 text-sm max-w-xs text-center">
          {error}
        </div>
      )}

      {/* Local play */}
      <div className="flex flex-col gap-3 w-64 mb-8">
        <button
          onClick={() => onStartLocal(4)}
          className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors shadow-lg"
        >
          Local Game (4 Players)
        </button>
        <button
          onClick={() => onStartLocal(3)}
          className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl font-medium transition-colors"
        >
          Local Game (3 Players)
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 w-64 mb-6">
        <div className="flex-1 h-px bg-stone-600" />
        <span className="text-stone-500 text-xs uppercase tracking-wider">Online</span>
        <div className="flex-1 h-px bg-stone-600" />
      </div>

      {/* Online play */}
      <div className="flex gap-3 w-64">
        <button
          onClick={onCreateOnline}
          className="flex-1 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
        >
          Create Game
        </button>
        <button
          onClick={onJoinOnline}
          className="flex-1 py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl font-medium transition-colors"
        >
          Join Game
        </button>
      </div>

      <p className="mt-12 text-stone-600 text-xs">Local games use hot-seat mode</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Lobby
// ---------------------------------------------------------------------------

function CreateLobby({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (playerCount: 3 | 4, displayName: string) => void;
}) {
  const [playerCount, setPlayerCount] = useState<3 | 4>(4);
  const [displayName, setDisplayName] = useState('');

  function handleCreate() {
    const name = displayName.trim() || 'Player';
    onCreate(playerCount, name);
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <h2 className="text-3xl font-bold text-amber-100 mb-6" style={{ fontFamily: 'Playfair Display' }}>
        Create Game
      </h2>

      <div className="flex flex-col gap-4 w-72">
        <div>
          <label className="block text-stone-400 text-sm mb-1.5">Your Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            className="w-full px-3 py-2.5 bg-stone-800 border border-stone-600 rounded-lg text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-stone-400 text-sm mb-1.5">Players</label>
          <div className="flex gap-2">
            {([3, 4] as const).map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                  playerCount === n
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                    : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                }`}
              >
                {n} Players
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors mt-2"
        >
          Create Room
        </button>

        <button
          onClick={onBack}
          className="w-full py-2 text-stone-400 hover:text-stone-300 text-sm transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join Lobby
// ---------------------------------------------------------------------------

function JoinLobby({
  onBack,
  onJoin,
  error,
}: {
  onBack: () => void;
  onJoin: (roomCode: string, displayName: string) => void;
  error: string | null;
}) {
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');

  function handleJoin() {
    const code = roomCode.trim().toUpperCase();
    const name = displayName.trim() || 'Player';
    if (!code) return;
    onJoin(code, name);
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <h2 className="text-3xl font-bold text-amber-100 mb-6" style={{ fontFamily: 'Playfair Display' }}>
        Join Game
      </h2>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/60 border border-red-700/50 rounded-lg text-red-300 text-sm max-w-xs text-center">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 w-72">
        <div>
          <label className="block text-stone-400 text-sm mb-1.5">Your Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            maxLength={16}
            className="w-full px-3 py-2.5 bg-stone-800 border border-stone-600 rounded-lg text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-stone-400 text-sm mb-1.5">Room Code</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABCD"
            maxLength={8}
            className="w-full px-3 py-2.5 bg-stone-800 border border-stone-600 rounded-lg text-white placeholder-stone-500 uppercase tracking-widest text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={!roomCode.trim()}
          className={`w-full py-3 rounded-xl font-medium transition-colors mt-2 ${
            roomCode.trim()
              ? 'bg-blue-700 hover:bg-blue-600 text-white'
              : 'bg-stone-800 text-stone-500 cursor-not-allowed'
          }`}
        >
          Join Room
        </button>

        <button
          onClick={onBack}
          className="w-full py-2 text-stone-400 hover:text-stone-300 text-sm transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connecting Screen
// ---------------------------------------------------------------------------

function ConnectingScreen() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <div className="animate-spin w-8 h-8 border-2 border-stone-500 border-t-blue-400 rounded-full mb-4" />
      <div className="text-white font-medium">Connecting...</div>
      <div className="text-stone-400 text-sm mt-1">Setting up your game</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waiting Screen (host waiting for players)
// ---------------------------------------------------------------------------

function WaitingScreen({
  roomId,
  onCancel,
}: {
  roomId: string;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyRoomId() {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <h2 className="text-2xl font-bold text-amber-100 mb-2" style={{ fontFamily: 'Playfair Display' }}>
        Waiting for Players
      </h2>
      <p className="text-stone-400 text-sm mb-8">Share this room code with friends</p>

      <div
        className="bg-stone-800 border border-stone-600 rounded-xl px-8 py-4 mb-4 cursor-pointer hover:border-stone-500 transition-colors"
        onClick={copyRoomId}
        title="Click to copy"
      >
        <div className="text-3xl font-mono font-bold text-white tracking-[0.3em]">
          {roomId}
        </div>
      </div>

      <button
        onClick={copyRoomId}
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors mb-8"
      >
        {copied ? 'Copied!' : 'Copy room code'}
      </button>

      <div className="flex items-center gap-2 text-stone-400 text-sm mb-6">
        <div className="animate-spin w-4 h-4 border-2 border-stone-600 border-t-stone-300 rounded-full" />
        <span>Waiting for others to join...</span>
      </div>

      <button
        onClick={onCancel}
        className="px-4 py-2 text-stone-400 hover:text-stone-300 text-sm transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
