import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface GameResult {
  id: string;
  stake: number;
  won: boolean;
  playerTime: number;
  opponentTime: number;
  prize: number;
  timestamp: number;
}

interface GameStats {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  totalEarned: number;
  bestTime: number | null;
}

interface GameContextType {
  gameHistory: GameResult[];
  stats: GameStats;
  addGameResult: (result: Omit<GameResult, 'id' | 'timestamp'>) => void;
}

const HISTORY_KEY = 'coincash_history_v1';

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((val) => {
        if (val !== null) setGameHistory(JSON.parse(val) as GameResult[]);
      })
      .catch(() => {});
  }, []);

  const addGameResult = useCallback((result: Omit<GameResult, 'id' | 'timestamp'>) => {
    const entry: GameResult = {
      ...result,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    setGameHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 200);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const stats = useMemo<GameStats>(() => {
    const wins = gameHistory.filter((g) => g.won).length;
    const losses = gameHistory.length - wins;
    const total = gameHistory.length;
    const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);
    const totalEarned = gameHistory
      .filter((g) => g.won)
      .reduce((sum, g) => sum + g.prize - g.stake, 0);
    const times = gameHistory.filter((g) => g.won).map((g) => g.playerTime);
    const bestTime = times.length > 0 ? Math.min(...times) : null;
    return { wins, losses, total, winRate, totalEarned, bestTime };
  }, [gameHistory]);

  return (
    <GameContext.Provider value={{ gameHistory, stats, addGameResult }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
