import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

export function useGameFinish(stake: number, gameType = 'play') {
  const { addCoins, addTransaction, syncFromServer } = useWallet();
  const { addGameResult } = useGame();
  const { token } = useAuth();
  const router = useRouter();
  const hasFinished = useRef(false);

  const finish = useCallback(
    (won: boolean, playerVal: number, aiVal: number, unit: string = 'ms') => {
      if (hasFinished.current) return;
      hasFinished.current = true;

      const prize = won ? stake * 2 - 5 : 0;

      // Immediate local update for responsive UI
      if (won) {
        addCoins(prize);
        addTransaction({ type: 'win', amount: prize, description: `Won ${stake}-coin match` });
      } else {
        addTransaction({ type: 'loss', amount: stake, description: `Lost ${stake}-coin match` });
      }
      addGameResult({ stake, won, playerTime: playerVal, opponentTime: aiVal, prize });

      // Save to server in background — syncs authoritative balance
      if (token) {
        api.saveGame({ stake, won, playerScore: playerVal, opponentScore: aiVal, prize, gameType }, token)
          .then(({ newBalance }) => syncFromServer(newBalance))
          .catch(() => {/* offline — local state is fine */});
      }

      router.replace({
        pathname: '/game/result',
        params: {
          won: won ? '1' : '0',
          playerTime: String(playerVal),
          opponentTime: String(aiVal),
          prize: String(prize),
          stake: String(stake),
          unit,
        },
      });
    },
    [stake, gameType, addCoins, addTransaction, addGameResult, syncFromServer, token, router]
  );

  return finish;
}
