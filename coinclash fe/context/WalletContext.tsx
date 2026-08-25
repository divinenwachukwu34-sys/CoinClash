import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface Transaction {
  id: string;
  type: 'deposit' | 'stake' | 'win' | 'loss' | 'withdrawal';
  amount: number;
  description: string;
  timestamp: number;
}

interface WalletContextType {
  coins: number;
  transactions: Transaction[];
  isLoading: boolean;
  deposit: (amount: number) => void;
  deductCoins: (amount: number) => void;
  addCoins: (amount: number) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
  syncFromServer: (balance: number) => void;
}

const COINS_KEY = 'coincash_coins_v2';
const TXS_KEY = 'coincash_transactions_v2';
const STARTING_COINS = 100;

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState(STARTING_COINS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const coinsRef = useRef(STARTING_COINS);

  useEffect(() => { coinsRef.current = coins; }, [coins]);

  useEffect(() => {
    (async () => {
      try {
        const [savedCoins, savedTxs] = await Promise.all([
          AsyncStorage.getItem(COINS_KEY),
          AsyncStorage.getItem(TXS_KEY),
        ]);
        if (savedCoins !== null) {
          const c = JSON.parse(savedCoins) as number;
          setCoins(c);
          coinsRef.current = c;
        }
        if (savedTxs !== null) setTransactions(JSON.parse(savedTxs) as Transaction[]);
      } catch (_) {}
      setIsLoading(false);
    })();
  }, []);

  const persistCoins = useCallback((amount: number) => {
    AsyncStorage.setItem(COINS_KEY, JSON.stringify(amount)).catch(() => {});
  }, []);

  const persistTxs = useCallback((txs: Transaction[]) => {
    AsyncStorage.setItem(TXS_KEY, JSON.stringify(txs)).catch(() => {});
  }, []);

  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id' | 'timestamp'>) => {
      const newTx: Transaction = {
        ...tx,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
      };
      setTransactions((prev) => {
        const updated = [newTx, ...prev].slice(0, 100);
        persistTxs(updated);
        return updated;
      });
    },
    [persistTxs]
  );

  const deposit = useCallback(
    (amount: number) => {
      const next = coinsRef.current + amount;
      coinsRef.current = next;
      setCoins(next);
      persistCoins(next);
      addTransaction({ type: 'deposit', amount, description: `Deposited ${amount} coins` });
    },
    [persistCoins, addTransaction]
  );

  const deductCoins = useCallback(
    (amount: number) => {
      const next = Math.max(0, coinsRef.current - amount);
      coinsRef.current = next;
      setCoins(next);
      persistCoins(next);
    },
    [persistCoins]
  );

  const addCoins = useCallback(
    (amount: number) => {
      const next = coinsRef.current + amount;
      coinsRef.current = next;
      setCoins(next);
      persistCoins(next);
    },
    [persistCoins]
  );

  /** Called after server sync — overrides local balance with authoritative server value */
  const syncFromServer = useCallback(
    (balance: number) => {
      coinsRef.current = balance;
      setCoins(balance);
      persistCoins(balance);
    },
    [persistCoins]
  );

  return (
    <WalletContext.Provider
      value={{ coins, transactions, isLoading, deposit, deductCoins, addCoins, addTransaction, syncFromServer }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
