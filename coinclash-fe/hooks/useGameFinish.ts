import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

export interface FinishExtra {
  playerAcc?: string;
  aiAcc?: string;
  playerTimeMs?: number;
  aiTimeMs?: number;
  tieBreaker?: 'accuracy' | 'time' | 'forfeit';
}

export function useGameFinish(stake: number, gameType = 'play') {
  const { addCoins, addTransaction, syncFromServer } = useWallet();
  const { addGameResult } = useGame();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tournamentId?: string }>();
  const tournamentId = params.tournamentId ? parseInt(params.tournamentId, 10) : undefined;
  const hasFinished = useRef(false);

  const finish = useCallback(
    (won: boolean, playerVal: number, aiVal: number, unit: string = 'ms', extra?: FinishExtra) => {
      if (hasFinished.current) return;
      hasFinished.current = true;

      const prize = won ? (stake > 0 && !tournamentId ? stake * 2 - 5 : 0) : 0;

      // Immediate local update for responsive UI
      if (stake > 0 && !tournamentId) {
        if (won) {
          addCoins(prize);
          addTransaction({ type: 'win', amount: prize, description: `Won ${stake}-coin match` });
        } else {
          addTransaction({ type: 'loss', amount: stake, description: `Lost ${stake}-coin match` });
        }
      }
      addGameResult({ stake: tournamentId ? 0 : stake, won, playerTime: playerVal, opponentTime: aiVal, prize });

      // Save to server
      if (token) {
        if (tournamentId) {
          api.submitTournamentMatch(tournamentId, won, gameType, playerVal, aiVal, token).catch(() => {});
        } else {
          api.saveGame({ stake, won, playerScore: playerVal, opponentScore: aiVal, prize, gameType }, token)
            .then(({ newBalance }) => syncFromServer(newBalance))
            .catch(() => {/* offline — local state is fine */});
        }
      }

      router.replace({
        pathname: '/game/result',
        params: {
          won: won ? '1' : '0',
          playerTime: String(playerVal),
          opponentTime: String(aiVal),
          prize: String(prize),
          stake: tournamentId ? '0' : String(stake),
          unit,
          tournamentId: tournamentId ? String(tournamentId) : undefined,
          playerAcc: extra?.playerAcc ?? '',
          aiAcc: extra?.aiAcc ?? '',
          playerTimeMs: extra?.playerTimeMs ? String(extra.playerTimeMs) : '',
          aiTimeMs: extra?.aiTimeMs ? String(extra.aiTimeMs) : '',
          tieBreaker: extra?.tieBreaker ?? '',
        },
      });
    },
    [stake, tournamentId, gameType, addCoins, addTransaction, addGameResult, syncFromServer, token, router]
  );

  return finish;
}
