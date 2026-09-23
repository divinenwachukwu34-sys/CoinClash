import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useColors } from '@/hooks/useColors';
import { useLiveMatch } from '@/hooks/useLiveMatch';
import { MatchmakingModal } from '@/components/MatchmakingModal';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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

type Phase = 'searching' | 'countdown' | 'early' | 'ready' | 'done';

export default function PlayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const isPractice = stake === 0;

  const { addCoins, addTransaction } = useWallet();
  const { addGameResult } = useGame();

  const {
    matchState,
    searchSeconds,
    startSearching,
    sendProgress,
    submitFinalScore,
    switchToBotMatch,
    cancelSearch,
  } = useLiveMatch('play', stake);

  const [phase, setPhase] = useState<Phase>('searching');
  const [count, setCount] = useState(3);

  const phaseRef = useRef<Phase>('searching');
  const hasFinished = useRef(false);
  const readyTimeRef = useRef(0);
  const opponentTimeRef = useRef(0);
  const opponentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tapScale = useSharedValue(1);
  const bgBrightness = useSharedValue(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Start matchmaking or offline practice on mount
  useEffect(() => {
    startSearching();
  }, [startSearching]);

  // When live match found or switched to bot match, start countdown
  useEffect(() => {
    if (matchState.status === 'matched' || matchState.status === 'offline_ai') {
      setPhase('countdown');
      setCount(3);
    }
  }, [matchState.status]);

  const finishGame = useCallback(
    (playerTime: number, opponentTime: number, won: boolean) => {
      if (hasFinished.current) return;
      hasFinished.current = true;

      const prize = won ? (stake > 0 ? stake * 2 - 5 : 0) : 0;

      // In real live match, submit to websocket
      if (matchState.status === 'matched' && matchState.roomId) {
        submitFinalScore(won ? 100 : 50, playerTime, '1/1');
      }

      if (stake > 0) {
        if (won) {
          addCoins(prize);
          addTransaction({
            type: 'win',
            amount: prize,
            description: `Won ${stake}-coin match against ${matchState.opponentUsername || 'Opponent'}`,
          });
        } else {
          addTransaction({
            type: 'loss',
            amount: stake,
            description: `Lost ${stake}-coin match against ${matchState.opponentUsername || 'Opponent'}`,
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
          opponentName: matchState.opponentUsername || (isPractice ? 'Medium Bot' : 'Opponent'),
        },
      });
    },
    [stake, addCoins, addTransaction, addGameResult, router, matchState.status, matchState.roomId, matchState.opponentUsername, submitFinalScore, isPractice]
  );

  const handleTap = useCallback(() => {
    const currentPhase = phaseRef.current;

    if (currentPhase === 'searching') return;

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

    sendProgress(100, 1000, playerTime);

    setTimeout(() => finishGame(playerTime, opponentTime, won), 600);
  }, [finishGame, tapScale, sendProgress]);

  // Countdown ticking
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (count <= 0) {
      // Transition to ready
      const t = setTimeout(() => {
        // Medium AI reaction time: 380ms - 580ms (fair and beatable)
        const oppMs = isPractice
          ? Math.round(420 + Math.random() * 180)
          : Math.round(320 + Math.random() * 250);

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
  }, [phase, count, finishGame, bgBrightness, isPractice]);

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
    stakeTag: {
      marginLeft: 'auto',
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stakeText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    opponentBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.card,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      marginHorizontal: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    opponentBannerText: {
      fontSize: 12,
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    gameArea: {
      flex: 1,
      paddingHorizontal: 20,
      paddingBottom: bottomPad + 20,
      justifyContent: 'space-between',
    },
    instructionArea: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    instructionTitle: {
      fontSize: 24,
      fontWeight: '700' as const,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    instructionSub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      marginTop: 6,
      textAlign: 'center',
    },
    tapTarget: {
      flex: 1,
      maxHeight: 380,
      borderRadius: 28,
      overflow: 'hidden',
    },
    tapGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    countdownCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary + '20',
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countdownNum: {
      fontSize: 48,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
    },
    tapPrompt: {
      alignItems: 'center',
      gap: 8,
    },
    tapPromptText: {
      fontSize: 32,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
      letterSpacing: 2,
    },
    earlyText: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },
  });

  return (
    <View style={styles.container}>
      {/* Real-time Matchmaking Overlay */}
      <MatchmakingModal
        visible={matchState.status === 'searching'}
        gameTitle="⚡ Tap Race"
        stake={stake}
        searchSeconds={searchSeconds}
        onCancel={() => {
          cancelSearch();
          router.back();
        }}
        onPlayBot={switchToBotMatch}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            cancelSearch();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.stakeTag}>
          <Text style={styles.stakeText}>
            {isPractice ? '🎯 Practice (Stake 0)' : `${stake} Coins Stake`}
          </Text>
        </View>
      </View>

      {/* Opponent Identity Banner */}
      {(matchState.status === 'matched' || matchState.status === 'offline_ai') && (
        <View style={styles.opponentBanner}>
          <MaterialCommunityIcons
            name={matchState.isPractice ? 'robot' : 'account'}
            size={16}
            color={matchState.isPractice ? colors.gold : colors.primary}
          />
          <Text style={styles.opponentBannerText}>
            Dueling vs <Text style={{ color: colors.gold }}>{matchState.opponentUsername || 'Opponent'}</Text>
          </Text>
        </View>
      )}

      {/* Main play area */}
      <View style={styles.gameArea}>
        <View style={styles.instructionArea}>
          <Text
            style={[
              styles.instructionTitle,
              {
                color:
                  phase === 'ready'
                    ? colors.accent
                    : phase === 'early'
                    ? colors.destructive
                    : colors.foreground,
              },
            ]}
          >
            {phase === 'countdown'
              ? 'Get Ready...'
              : phase === 'ready'
              ? '⚡ TAP NOW!'
              : phase === 'early'
              ? '❌ Too Early!'
              : phase === 'done'
              ? 'Done!'
              : 'Waiting for Match...'}
          </Text>
          <Text style={styles.instructionSub}>
            {phase === 'countdown'
              ? 'Tap immediately when the screen turns green!'
              : phase === 'ready'
              ? 'Fastest reaction wins!'
              : phase === 'early'
              ? 'Foul start — automatic round loss'
              : ''}
          </Text>
        </View>

        {/* Tap area */}
        <Animated.View style={[styles.tapTarget, tapAnimStyle]}>
          <Pressable style={{ flex: 1 }} onPress={handleTap}>
            <LinearGradient colors={tapAreaColors} style={styles.tapGradient}>
              {phase === 'countdown' ? (
                <View style={styles.countdownCircle}>
                  <Text style={styles.countdownNum}>{count > 0 ? count : 'GO'}</Text>
                </View>
              ) : phase === 'ready' ? (
                <View style={styles.tapPrompt}>
                  <Ionicons name="flash" size={64} color="#FFFFFF" />
                  <Text style={styles.tapPromptText}>TAP!</Text>
                </View>
              ) : phase === 'early' ? (
                <View style={styles.tapPrompt}>
                  <Ionicons name="close-circle" size={48} color="#FFFFFF" />
                  <Text style={styles.earlyText}>Too Early!</Text>
                </View>
              ) : phase === 'done' ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : (
                <ActivityIndicator size="large" color={colors.primary} />
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
