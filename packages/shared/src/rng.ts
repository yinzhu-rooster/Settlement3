// ============================================================
// Deterministic RNG — shared across all modules
// Uses a Linear Congruential Generator (LCG).
// State is a single number, fully serializable.
// ============================================================

/**
 * Advance the LCG state and return a float in [0, 1) plus the next state.
 */
export function nextRng(state: number): { value: number; nextState: number } {
  const nextState = (state * 1664525 + 1013904223) & 0x7fffffff;
  return { value: nextState / 0x7fffffff, nextState };
}

/**
 * Create an initial RNG state from an optional seed.
 * If no seed is provided, uses a default.
 */
export function initRngState(seed?: number): number {
  return seed ?? 12345;
}

/**
 * Shuffle an array using the deterministic RNG.
 * Returns a new shuffled array and the advanced RNG state.
 */
export function shuffleWithRng<T>(arr: T[], rngState: number): { result: T[]; nextState: number } {
  const result = [...arr];
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const { value, nextState } = nextRng(state);
    state = nextState;
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { result, nextState: state };
}
