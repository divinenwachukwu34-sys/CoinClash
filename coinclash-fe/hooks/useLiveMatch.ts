import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '@/constants/config';
import { useAuth } from '@/context/AuthContext';

export interface MatchState {
  status: 'idle' | 'searching' | 'matched' | 'playing' | 'ended' | 'offline_ai';
  roomId: string | null;
  opponentUsername: string;
  opponentId: number | null;
  opponentProgress: number;
  opponentScore: number;
  isPractice: boolean;
  gameResult: {
    won: boolean;
    prize: number;
    playerScore: number;
    opponentScore: number;
    playerTimeMs: number;
    opponentTimeMs: number;
    playerAcc: string;
    aiAcc: string;
  } | null;
}

export function useLiveMatch(gameType: string, stake: number) {
  const { token, user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isPractice = stake === 0;

  const [matchState, setMatchState] = useState<MatchState>({
    status: isPractice ? 'offline_ai' : 'idle',
    roomId: null,
    opponentUsername: isPractice ? 'Bot Player' : '',
    opponentId: null,
    opponentProgress: 0,
    opponentScore: 0,
    isPractice,
    gameResult: null,
  });

  const [searchSeconds, setSearchSeconds] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSearching = useCallback(() => {
    if (isPractice) {
      setMatchState({
        status: 'offline_ai',
        roomId: null,
        opponentUsername: 'Bot Player',
        opponentId: null,
        opponentProgress: 0,
        opponentScore: 0,
        isPractice: true,
        gameResult: null,
      });
      return;
    }

    if (!token) return;

    setMatchState((s) => ({ ...s, status: 'searching' }));
    setSearchSeconds(0);

    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    searchTimerRef.current = setInterval(() => {
      setSearchSeconds((sec) => sec + 1);
    }, 1000);

    const wsUrl = `${getWsUrl('ws/match')}?token=${encodeURIComponent(token)}&game=${encodeURIComponent(gameType)}&stake=${stake}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Matchmaking connected for', gameType, stake);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'MATCH_FOUND') {
          if (searchTimerRef.current) clearInterval(searchTimerRef.current);
          setMatchState((s) => ({
            ...s,
            status: 'matched',
            roomId: data.roomId,
            opponentUsername: data.opponentUsername,
            opponentId: data.opponentId,
          }));
        } else if (data.event === 'OPPONENT_PROGRESS') {
          setMatchState((s) => ({
            ...s,
            opponentProgress: data.progress ?? s.opponentProgress,
            opponentScore: data.score ?? s.opponentScore,
          }));
        } else if (data.event === 'GAME_OVER') {
          setMatchState((s) => ({
            ...s,
            status: 'ended',
            gameResult: {
              won: data.won,
              prize: data.prize,
              playerScore: data.playerScore,
              opponentScore: data.opponentScore,
              playerTimeMs: data.playerTimeMs,
              opponentTimeMs: data.opponentTimeMs,
              playerAcc: data.playerAcc,
              aiAcc: data.aiAcc,
            },
          }));
        } else if (data.event === 'OPPONENT_DISCONNECTED') {
          setMatchState((s) => ({
            ...s,
            status: 'ended',
            gameResult: {
              won: true,
              prize: stake > 0 ? stake * 2 - 5 : 0,
              playerScore: 100,
              opponentScore: 0,
              playerTimeMs: 0,
              opponentTimeMs: 999999,
              playerAcc: 'Default Win',
              aiAcc: 'Disconnected',
            },
          }));
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onerror = (e) => {
      console.warn('[WS] Error:', e);
    };

    ws.onclose = () => {
      console.log('[WS] Closed');
    };
  }, [gameType, stake, token, isPractice]);

  const sendProgress = useCallback((progress: number, score: number, timeMs: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && matchState.roomId) {
      wsRef.current.send(
        JSON.stringify({
          event: 'GAME_PROGRESS',
          roomId: matchState.roomId,
          progress,
          score,
          timeMs,
        })
      );
    }
  }, [matchState.roomId]);

  const submitFinalScore = useCallback((score: number, timeMs: number, accuracy: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && matchState.roomId) {
      wsRef.current.send(
        JSON.stringify({
          event: 'GAME_SUBMIT',
          roomId: matchState.roomId,
          score,
          timeMs,
          accuracy,
        })
      );
    }
  }, [matchState.roomId]);

  const switchToBotMatch = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ event: 'LEAVE_QUEUE' }));
        wsRef.current.close();
      } catch {}
    }
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    setMatchState({
      status: 'offline_ai',
      roomId: null,
      opponentUsername: 'Medium Bot',
      opponentId: null,
      opponentProgress: 0,
      opponentScore: 0,
      isPractice: false,
      gameResult: null,
    });
  }, []);

  const cancelSearch = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ event: 'LEAVE_QUEUE' }));
        wsRef.current.close();
      } catch {}
    }
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    setMatchState((s) => ({ ...s, status: 'idle' }));
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
    };
  }, []);

  return {
    matchState,
    searchSeconds,
    startSearching,
    sendProgress,
    submitFinalScore,
    switchToBotMatch,
    cancelSearch,
    setMatchState,
  };
}
