import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Phase = 'matching' | 'countdown' | 'early' | 'ready' | 'done';

export default function PlayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const { addCoins, addTransaction } = useWallet();
  const { addGameResult } = useGame();

  const [phase, setPhase] = useState<Phase>('matching');
  const [count, setCount] = useState(3);

  const phaseRef = useRef<Phase>('matching');
  const hasFinished = useRef(false);
  const readyTimeRef = useRef(0);
  const opponentTimeRef = useRef(0);
  const opponentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tapScale = useSharedValue(1);
  const bgBrightness = useSharedValue(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const finishGame = useCallback(
    (playerTime: number, opponentTime: number, won: boolean) => {
      if (hasFinished.current) return;
      hasFinished.current = true;

      const prize = won ? (stake > 0 ? stake * 2 - 5 : 0) : 0;

      if (stake > 0) {
        if (won) {
          addCoins(prize);
          addTransaction({
            type: 'win',
            amount: prize,
            description: `Won ${stake}-coin match`,
          });
        } else {
          addTransaction({
            type: 'loss',
            amount: stake,
            description: `Lost ${stake}-coin match`,
          });
        }
      }

      addGameResult({ stake, won, playerTime, opponentTime, prize });

      router.replace({
        pathname: '/game/result',
        params: {
          won: won ? '1' : '0',
          playerTime: String(playerTime),
          opponentTime: String(opponentTime),
          prize: String(prize),
          stake: String(stake),
        },
      });
    },
    [stake, addCoins, addTransaction, addGameResult, router]
  );

  const handleTap = useCallback(() => {
    const currentPhase = phaseRef.current;

    if (currentPhase === 'matching') return;

    if (currentPhase === 'countdown') {
      // Too early!
      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
      setPhase('early');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const oppTime = 350;
      opponentTimeRef.current = oppTime;
      setTimeout(() => {
        finishGame(0, oppTime, false);
      }, 1200);
      return;
    }

    if (currentPhase !== 'ready') return;

    const playerTime = Date.now() - readyTimeRef.current;
    const opponentTime = opponentTimeRef.current;
    const won = playerTime < opponentTime;

    if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
    setPhase('done');

    tapScale.value = withSequence(withSpring(0.9, { damping: 8 }), withSpring(1));
    Haptics.impactAsync(won ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => finishGame(playerTime, opponentTime, won), 600);
  }, [finishGame, tapScale]);

  // Matching → countdown
  useEffect(() => {
    if (phase !== 'matching') return;
    const t = setTimeout(() => {
      setPhase('countdown');
      setCount(3);
    }, 1600);
    return () => clearTimeout(t);
  }, [phase]);

  // Countdown ticking
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (count <= 0) {
      // Transition to ready after a short pause
      const t = setTimeout(() => {
        const oppMs = Math.round(200 + Math.random() * 300); // 300–720ms
        opponentTimeRef.current = oppMs;
        readyTimeRef.current = Date.now();
        setPhase('ready');
        bgBrightness.value = withTiming(1, { duration: 100 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        opponentTimerRef.current = setTimeout(() => {
          if (!hasFinished.current && phaseRef.current === 'ready') {
            const playerTime = Date.now() - readyTimeRef.current;
            setPhase('done');
            finishGame(playerTime, oppMs, false);
          }
        }, oppMs);
      }, 400);
      return () => clearTimeout(t);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, finishGame, bgBrightness]);

  useEffect(() => {
    return () => {
      if (opponentTimerRef.current) clearTimeout(opponentTimerRef.current);
    };
  }, []);

  const tapAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: tapScale.value }],
  }));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const tapAreaColors: [string, string] =
    phase === 'ready'
      ? ['#064E3B', '#059669']
      : phase === 'early'
      ? ['#7F1D1D', '#DC2626']
      : ['#14142A', '#1F1F3A'];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    topBar: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stakeLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
    },
    arena: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
      gap: 24,
    },
    statusText: {
      fontSize: 18,
      color: colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
      textAlign: 'center',
    },
    countdownNum: {
      fontSize: 96,
      fontWeight: '700' as const,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    tapArea: {
      width: '100%',
      height: 220,
      borderRadius: 24,
      overflow: 'hidden',
      marginBottom: bottomPad + 20,
    },
    tapGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    tapLabel: {
      fontSize: 36,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },
    tapSub: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.7)',
      fontFamily: 'Inter_400Regular',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={18} color={colors.mutedForeground} />
        </Pressable>
        <Text style={styles.stakeLabel}>Stake: {stake} coins</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.arena}>
        {phase === 'matching' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>Finding opponent...</Text>
          </>
        )}

        {phase === 'countdown' && count > 0 && (
          <>
            <Text style={[styles.statusText]}>Get ready...</Text>
            <Text style={[styles.countdownNum, { color: colors.foreground }]}>{count}</Text>
          </>
        )}

        {phase === 'countdown' && count === 0 && (
          <Text style={[styles.countdownNum, { color: colors.gold }]}>GO!</Text>
        )}

        {phase === 'early' && (
          <>
            <Ionicons name="warning" size={48} color={colors.destructive} />
            <Text style={[styles.statusText, { color: colors.destructive }]}>
              Too early! You lose this round.
            </Text>
          </>
        )}

        {(phase === 'ready' || phase === 'done') && (
          <Text style={[styles.statusText, { color: colors.accent }]}>TAP THE BUTTON!</Text>
        )}
      </View>

      {/* Tap button — always visible so player can't tap early accidentally on game start */}
      <Animated.View style={[styles.tapArea, tapAnimStyle, { marginHorizontal: 20 }]}>
        <Pressable onPress={handleTap} style={{ flex: 1 }}>
          <LinearGradient colors={tapAreaColors} style={styles.tapGradient}>
            {phase === 'ready' && (
              <>
                <Text style={styles.tapLabel}>TAP!</Text>
                <Text style={styles.tapSub}>Tap as fast as you can</Text>
              </>
            )}
            {phase === 'matching' && (
              <Text style={[styles.tapSub, { color: 'rgba(255,255,255,0.4)' }]}>
                Wait for the signal...
              </Text>
            )}
            {phase === 'countdown' && (
              <Text style={[styles.tapSub, { color: 'rgba(255,255,255,0.4)' }]}>
                Don't tap yet!
              </Text>
            )}
            {phase === 'early' && (
              <Text style={[styles.tapLabel, { color: colors.destructive }]}>TOO EARLY!</Text>
            )}
            {phase === 'done' && (
              <Text style={styles.tapSub}>Calculating result...</Text>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <View style={{ height: bottomPad + 20 }} />
    </View>
  );
}
