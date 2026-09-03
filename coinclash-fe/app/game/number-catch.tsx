import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROUNDS = 5;
const MAX_NUM = 12;
const TICK_MS = 250;

export default function NumberCatchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const [phase, setPhase] = useState<'intro' | 'playing' | 'feedback' | 'done'>('intro');
  const [roundIdx, setRoundIdx] = useState(0);
  const [counter, setCounter] = useState(1);
  const [playerErrors, setPlayerErrors] = useState<number[]>([]);
  const [lastError, setLastError] = useState<number | null>(null);
  const counterRef = useRef(1);

  // Timers
  const startTime = useRef(Date.now());
  const [elapsedSec, setElapsedSec] = useState('0.0');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // AI parameters (pre-computed randomized performance)
  const aiTotalError = useRef(Math.floor(Math.random() * 2)); // 0–1 error
  const aiTime = useRef(ROUNDS * (1200 + Math.random() * 600));

  const buildTarget = () => Math.floor(Math.random() * (MAX_NUM - 3)) + 2; // 2 to MAX_NUM-1

  const [targets] = useState<number[]>(() =>
    Array.from({ length: ROUNDS }, buildTarget)
  );

  // Automatic Loss if leaving mid-game
  const handleQuit = useCallback(() => {
    if (phase === 'done') {
      router.back();
      return;
    }
    Alert.alert(
      'Quit Game?',
      'Leaving a game in progress will result in an AUTOMATIC LOSS and forfeit your stake to the opponent.',
      [
        { text: 'Stay & Fight', style: 'cancel' },
        {
          text: 'Forfeit Match',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            finish(false, 999, 0, 'err');
          },
        },
      ]
    );
  }, [phase, finish, router]);

  // Keep counterRef in sync
  useEffect(() => { counterRef.current = counter; }, [counter]);

  // Tick counter during playing
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => {
      setCounter((c) => {
        const next = c >= MAX_NUM ? 1 : c + 1;
        counterRef.current = next;
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Total stopwatch
  useEffect(() => {
    if (phase === 'done') return;
    const t = setInterval(() => {
      const spent = (Date.now() - startTime.current) / 1000;
      setElapsedSec(spent.toFixed(1));
    }, 50);
    return () => clearInterval(t);
  }, [phase]);

  const handleTap = useCallback(() => {
    if (phase !== 'playing') return;
    const curr = counterRef.current;
    const t = targets[roundIdx];
    const err = Math.abs(curr - t);
    Haptics.impactAsync(err === 0 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    setLastError(err);
    setPhase('feedback');
    const newErrors = [...playerErrors, err];
    setPlayerErrors(newErrors);

    setTimeout(() => {
      setLastError(null);
      if (roundIdx + 1 >= ROUNDS) {
        const totalErr = newErrors.reduce((a, b) => a + b, 0);
        const totalTime = Date.now() - startTime.current;

        // Tie-breaker: lower error wins, or faster total time if errors are equal
        const won =
          totalErr < aiTotalError.current ||
          (totalErr === aiTotalError.current && totalTime < aiTime.current);

        setPhase('done');
        const tieBreaker = totalErr !== aiTotalError.current ? 'accuracy' : 'time';
        finish(won, totalTime, aiTime.current, 'ms', {
          playerAcc: `${totalErr} err`,
          aiAcc: `${aiTotalError.current} err`,
          playerTimeMs: totalTime,
          aiTimeMs: aiTime.current,
          tieBreaker,
        });
      } else {
        setRoundIdx((r) => r + 1);
        setCounter(1);
        counterRef.current = 1;
        setPhase('playing');
      }
    }, 800);
  }, [phase, roundIdx, targets, playerErrors, finish]);

  useEffect(() => {
    const timer = setTimeout(() => setPhase('playing'), 600);
    return () => clearTimeout(timer);
  }, []);

  const currentTarget = targets[roundIdx];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    stopwatch: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    stopwatchText: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_700Bold' },

    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
    targetCard: {
      backgroundColor: colors.card, borderRadius: 20, borderWidth: 1,
      borderColor: colors.border, paddingVertical: 18, paddingHorizontal: 36,
      alignItems: 'center', gap: 4,
    },
    targetLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    targetNum: { fontSize: 52, fontWeight: '700' as const, color: colors.gold, fontFamily: 'Inter_700Bold' },
    counterDisc: {
      width: 170, height: 170, borderRadius: 85,
      backgroundColor: colors.card, borderWidth: 4,
      alignItems: 'center', justifyContent: 'center',
    },
    counterNum: { fontSize: 64, fontWeight: '800' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    tapBtn: { width: '80%', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    tapBtnText: { fontSize: 20, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' },

    progressRow: { flexDirection: 'row', gap: 8 },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F291E', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Number Catch — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.targetCard}>
          <Text style={styles.targetLabel}>TARGET NUMBER</Text>
          <Text style={styles.targetNum}>{currentTarget}</Text>
        </View>

        <View style={[styles.counterDisc, { borderColor: counter === currentTarget ? colors.accent : colors.border }]}>
          <Text style={styles.counterNum}>{counter}</Text>
        </View>

        {lastError !== null ? (
          <Text style={{ fontSize: 18, color: lastError === 0 ? colors.accent : colors.destructive, fontWeight: '700' }}>
            {lastError === 0 ? '🎯 PERFECT CATCH!' : `❌ MISSED BY ${lastError}`}
          </Text>
        ) : (
          <Pressable style={{ width: '100%', alignItems: 'center' }} onPress={handleTap} disabled={phase !== 'playing'}>
            <LinearGradient colors={[colors.accent, '#059669']} style={styles.tapBtn}>
              <Text style={styles.tapBtnText}>CATCH!</Text>
            </LinearGradient>
          </Pressable>
        )}

        <View style={styles.progressRow}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i < playerErrors.length ? (playerErrors[i] === 0 ? colors.accent : colors.destructive) : 'transparent',
                  borderColor: i === roundIdx ? colors.gold : colors.muted,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
