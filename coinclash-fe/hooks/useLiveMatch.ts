import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '@/constants/config';
import { useAuth } from '@/context/AuthContext';

// How long (ms) the server tells clients to display the opponent screen
// This must match MATCH_DISPLAY_SECONDS in services/matchmaking.py
const DEFAULT_DISPLAY_MS = 4000;

// Practice mode: how many seconds to search for a real player before falling back to bot
const PRACTICE_SEARCH_TIMEOUT_SEC = 10;

export interface MatchState {
  status: 'idle' | 'searching' | 'matched' | 'playing' | 'ended' | 'offline_ai';
  roomId: string | null;
  // Identity of both players (canonical)
  player1Id: number | null;
  player2Id: number | null;
  opponentId: number | null;
  opponentUsername: string;
  opponentAvatar?: string;
  // Live progress
  opponentProgress: number;
  opponentScore: number;
  isPractice: boolean;
  // Canonical result (identical for both clients)
  gameResult: GameResult | null;
}

/**
 * Canonical game result — identical object sent to both players by the backend.
 * The client derives its own "won" / "playerScore" by comparing its user_id
 * against player1Id. Never use playerScore/opponentScore as a source of truth.
 */
export interface GameResult {
  // ── Canonical identity ─────────────────────────────────────────────────────
  player1Id: number;
  player2Id: number;
  winnerId: number | null;
  loserId: number | null;
  // ── Canonical scores ───────────────────────────────────────────────────────
  player1Score: number;
  player1TimeMs: number;
  player1Acc: string;
  player2Score: number;
  player2TimeMs: number;
  player2Acc: string;
  // ── Match metadata ─────────────────────────────────────────────────────────
  stake: number;
  prize: number;
  isDraw: boolean;
  cancelled: boolean;
  reason: string;
  // ── Derived convenience fields (set by hook, not backend) ─────────────────
  won: boolean;          // true if MY user_id == winnerId
  playerScore: number;   // MY score
  playerTimeMs: number;  // MY time
  playerAcc: string;     // MY accuracy
  opponentScore: number;
  opponentTimeMs: number;
  aiAcc: string;         // opponent accuracy (legacy name kept for screen compat)
}

export function useLiveMatch(gameType: string, stake: number) {
  const { token, user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const isPractice = stake === 0;

  const [matchState, setMatchState] = useState<MatchState>({
    status: 'idle',           // always start idle; startSearching() will switch
    roomId: null,
    player1Id: null,
    player2Id: null,
    opponentId: null,
    opponentUsername: isPractice ? 'Bot Player' : '',
    opponentAvatar: 'avatar_1',
    opponentProgress: 0,
    opponentScore: 0,
    isPractice,
    gameResult: null,
  });

  const [searchSeconds, setSearchSeconds] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const practiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSwitchedToBotRef = useRef(false);

  // ── Helper: switch to bot match ──────────────────────────────────────────
  const _switchToBotInternal = useCallback(() => {
    if (hasSwitchedToBotRef.current) return;
    hasSwitchedToBotRef.current = true;
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ event: 'LEAVE_QUEUE' })); } catch {}
      try { wsRef.current.close(); } catch {}
    }
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    if (practiceTimeoutRef.current) clearTimeout(practiceTimeoutRef.current);
    setMatchState((s) => ({
      ...s,
      status: 'offline_ai',
      roomId: null,
      player1Id: null,
      player2Id: null,
      opponentId: null,
      opponentUsername: 'Medium Bot',
      opponentAvatar: 'avatar_1',
      gameResult: null,
    }));
  }, []);

  // ── Start searching ───────────────────────────────────────────────────────
  const startSearching = useCallback(() => {
    if (!token) return;

    hasSwitchedToBotRef.current = false;
    setMatchState((s) => ({ ...s, status: 'searching' }));
    setSearchSeconds(0);

    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    searchTimerRef.current = setInterval(() => {
      setSearchSeconds((sec) => sec + 1);
    }, 1000);

    // Practice mode: auto-switch to bot after PRACTICE_SEARCH_TIMEOUT_SEC
    if (isPractice) {
      if (practiceTimeoutRef.current) clearTimeout(practiceTimeoutRef.current);
      practiceTimeoutRef.current = setTimeout(() => {
        _switchToBotInternal();
      }, PRACTICE_SEARCH_TIMEOUT_SEC * 1000);
    }

    const wsUrl = `${getWsUrl('ws/match')}?token=${encodeURIComponent(token)}&game=${encodeURIComponent(gameType)}&stake=${stake}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected for', gameType, stake);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // ── MATCH_FOUND ────────────────────────────────────────────────────
        if (data.event === 'MATCH_FOUND') {
          if (searchTimerRef.current) clearInterval(searchTimerRef.current);
          if (practiceTimeoutRef.current) clearTimeout(practiceTimeoutRef.current);

          setMatchState((s) => ({
            ...s,
            status: 'matched',
            roomId: data.roomId,
            player1Id: data.player1Id,
            player2Id: data.player2Id,
            opponentId: data.opponentId,
            opponentUsername: data.opponentUsername,
            opponentAvatar: data.opponentAvatar || 'avatar_1',
            isPractice: false,
          }));
        }

        // ── GAME_BEGIN ─────────────────────────────────────────────────────
        else if (data.event === 'GAME_BEGIN') {
          setMatchState((s) => ({
            ...s,
            status: 'playing',
          }));
        }

        // ── OPPONENT_PROGRESS (live relay) ─────────────────────────────────
        else if (data.event === 'OPPONENT_PROGRESS') {
          setMatchState((s) => ({
            ...s,
            opponentProgress: data.progress ?? s.opponentProgress,
            opponentScore: data.score ?? s.opponentScore,
          }));
        }

        // ── GAME_OVER (canonical — identical for both clients) ─────────────
        else if (data.event === 'GAME_OVER') {
          // The backend sends absolute player1/player2 fields. We derive the
          // player's own perspective by comparing user IDs.
          const myId = user?.id;
          const amPlayer1 = myId === data.player1Id;

          const playerScore   = amPlayer1 ? data.player1Score   : data.player2Score;
          const playerTimeMs  = amPlayer1 ? data.player1TimeMs  : data.player2TimeMs;
          const playerAcc     = amPlayer1 ? data.player1Acc     : data.player2Acc;
          const oppScore      = amPlayer1 ? data.player2Score   : data.player1Score;
          const oppTimeMs     = amPlayer1 ? data.player2TimeMs  : data.player1TimeMs;
          const oppAcc        = amPlayer1 ? data.player2Acc     : data.player1Acc;
          const won           = data.winnerId != null && myId === data.winnerId;

          const result: GameResult = {
            player1Id:     data.player1Id,
            player2Id:     data.player2Id,
            winnerId:      data.winnerId ?? null,
            loserId:       data.loserId ?? null,
            player1Score:  data.player1Score,
            player1TimeMs: data.player1TimeMs,
            player1Acc:    data.player1Acc,
            player2Score:  data.player2Score,
            player2TimeMs: data.player2TimeMs,
            player2Acc:    data.player2Acc,
            stake:         data.stake,
            prize:         data.prize,
            isDraw:        data.isDraw || false,
            cancelled:     data.cancelled || false,
            reason:        data.reason || '',
            // Derived
            won,
            playerScore,
            playerTimeMs,
            playerAcc,
            opponentScore: oppScore,
            opponentTimeMs: oppTimeMs,
            aiAcc: oppAcc,
          };

          setMatchState((s) => ({
            ...s,
            status: 'ended',
            gameResult: result,
          }));
        }

        // ── OPPONENT_DISCONNECTED ──────────────────────────────────────────
        else if (data.event === 'OPPONENT_DISCONNECTED') {
          // Backend now also sends canonical fields here
          const myId = user?.id;
          const amPlayer1 = myId === data.player1Id;

          const result: GameResult = {
            player1Id:     data.player1Id ?? myId ?? 0,
            player2Id:     data.player2Id ?? 0,
            winnerId:      data.winnerId ?? null,
            loserId:       data.loserId ?? null,
            player1Score:  amPlayer1 ? 100 : 0,
            player1TimeMs: 0,
            player1Acc:    amPlayer1 ? 'Default Win' : 'Disconnected',
            player2Score:  amPlayer1 ? 0 : 100,
            player2TimeMs: 0,
            player2Acc:    amPlayer1 ? 'Disconnected' : 'Default Win',
            stake:         data.stake ?? stake,
            prize:         data.prize ?? (stake > 0 ? stake * 2 - 5 : 0),
            isDraw:        false,
            cancelled:     false,
            reason:        'OPPONENT_DISCONNECTED',
            won:           true,
            playerScore:   100,
            playerTimeMs:  0,
            playerAcc:     'Default Win',
            opponentScore: 0,
            opponentTimeMs: 999999,
            aiAcc:         'Disconnected',
          };

          setMatchState((s) => ({
            ...s,
            status: 'ended',
            gameResult: result,
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
      console.log('[WS] Closed for', gameType);
    };
  }, [gameType, stake, token, isPractice, _switchToBotInternal, user?.id]);

  // ── Send GAME_START (called once by game screen after display phase) ──────
  const sendGameStart = useCallback(() => {
    setMatchState((s) => {
      // Read roomId from the current state snapshot
      const roomId = s.roomId;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && roomId) {
        wsRef.current.send(
          JSON.stringify({ event: 'GAME_START', roomId })
        );
      }
      return s; // no state change
    });
  }, []);

  // ── Send progress update ──────────────────────────────────────────────────
  const sendProgress = useCallback((progress: number, score: number, timeMs: number) => {
    setMatchState((s) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && s.roomId) {
        wsRef.current.send(
          JSON.stringify({ event: 'GAME_PROGRESS', roomId: s.roomId, progress, score, timeMs })
        );
      }
      return s;
    });
  }, []);

  // ── Submit final score ────────────────────────────────────────────────────
  const submitFinalScore = useCallback((score: number, timeMs: number, accuracy: string) => {
    setMatchState((s) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && s.roomId) {
        wsRef.current.send(
          JSON.stringify({ event: 'GAME_SUBMIT', roomId: s.roomId, score, timeMs, accuracy })
        );
      }
      return s;
    });
  }, []);

  // ── Switch to bot (public API for manual trigger) ─────────────────────────
  const switchToBotMatch = useCallback(() => {
    if (!isPractice) return;
    _switchToBotInternal();
  }, [isPractice, _switchToBotInternal]);

  // ── Cancel search ─────────────────────────────────────────────────────────
  const cancelSearch = useCallback(() => {
    if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    if (practiceTimeoutRef.current) clearTimeout(practiceTimeoutRef.current);
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ event: 'LEAVE_QUEUE' })); } catch {}
      try { wsRef.current.close(); } catch {}
    }
    setMatchState((s) => ({ ...s, status: 'idle' }));
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
      if (practiceTimeoutRef.current) clearTimeout(practiceTimeoutRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, []);

  return {
    matchState,
    searchSeconds,
    startSearching,
    sendGameStart,
    sendProgress,
    submitFinalScore,
    switchToBotMatch,
    cancelSearch,
    setMatchState,
  };
}
