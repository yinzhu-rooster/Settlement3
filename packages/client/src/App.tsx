import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { GameServiceContext } from './hooks/use-game';
import { BuildModeContext, type BuildMode } from './hooks/use-build-mode';
import { LocalGameService } from './services/local-game-service';
import { BoardRenderer } from './canvas/board-renderer';
import { TopBar } from './ui/top-bar';
import { ActionBar } from './ui/action-bar';
import { VictoryScreen } from './ui/victory-screen';

// Error boundary to catch rendering errors
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

export function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [gameService, setGameService] = useState<LocalGameService | null>(null);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);

  function startGame(playerCount: 3 | 4) {
    try {
      const service = new LocalGameService({ maxPlayers: playerCount });
      setGameService(service);
      setBuildMode(null);
      setScreen('game');
    } catch (e) {
      console.error('Failed to create game service:', e);
    }
  }

  if (screen === 'menu') {
    return <MainMenu onStart={startGame} />;
  }

  if (!gameService) return null;

  return (
    <ErrorBoundary>
      <GameServiceContext.Provider value={gameService}>
        <BuildModeContext.Provider value={{ buildMode, setBuildMode }}>
          <div className="relative w-full h-full">
            <TopBar />
            <GameBoard />
            <ActionBar />
            <VictoryScreen onNewGame={() => setScreen('menu')} />
          </div>
        </BuildModeContext.Provider>
      </GameServiceContext.Provider>
    </ErrorBoundary>
  );
}

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

function MainMenu({ onStart }: { onStart: (players: 3 | 4) => void }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-stone-900 to-stone-800">
      <h1 className="text-5xl font-bold text-amber-100 mb-2" style={{ fontFamily: 'Playfair Display' }}>
        Settlement3
      </h1>
      <p className="text-stone-400 mb-10 text-sm">A game of trading and building</p>

      <div className="flex flex-col gap-3 w-64">
        <button
          onClick={() => onStart(4)}
          className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors shadow-lg"
        >
          New Game (4 Players)
        </button>
        <button
          onClick={() => onStart(3)}
          className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl font-medium transition-colors"
        >
          New Game (3 Players)
        </button>
      </div>

      <p className="mt-12 text-stone-600 text-xs">Local hot-seat mode</p>
    </div>
  );
}
