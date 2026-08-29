import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROUNDS = 3;
const MAX_NUM = 10;
const TICK_MS = 280;

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
  const [target, setTarget] = useState(0);
  const [playerErrors, setPlayerErrors] = useState<number[]>([]);
  const [lastError, setLastError] = useState<number | null>(null);
  const counterRef = useRef(1);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const aiTotalError = useRef(Math.round(Math.random() * 2)); // 0–2 total error

  const buildTarget = () => Math.floor(Math.random() * (MAX_NUM - 2)) + 2; // 2-9

  const [targets] = useState<number[]>(() =>
    Array.from({ length: ROUNDS }, buildTarget)
  );

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
        const won = totalErr <= aiTotalError.current;
        setPhase('done');
        finish(won, totalErr, aiTotalError.current, 'err');
      } else {
        setRoundIdx((r) => r + 1);
        setCounter(1);
        counterRef.current = 1;
        setPhase('playing');
      }
    }, 1000);
  }, [phase, roundIdx, targets, playerErrors, finish]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
    targetCard: {
      backgroundColor: colors.card, borderRadius: 20, borderWidth: 1,
      borderColor: colors.border, paddingVertical: 20, paddingHorizontal: 40,
      alignItems: 'center', gap: 4,
    },
    targetLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    targetNum: { fontSize: 52, fontWeight: '700' as const, color: colors.gold, fontFamily: 'Inter_700Bold' },
    counterDisc: {
      width: 160, height: 160, borderRadius: 80,
      backgroundColor: colors.card, borderWidth: 4,
      alignItems: 'center', justifyContent: 'center',
    },
    counterNum: { fontSize: 72, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
    tapBtn: {
      paddingHorizontal: 48, paddingVertical: 18, borderRadius: 16,
      alignItems: 'center',
    },
    tapBtnText: { fontSize: 18, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' },
    feedbackText: { fontSize: 18, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
    errRow: { flexDirection: 'row', gap: 8 },
    errDot: { width: 12, height: 12, borderRadius: 6 },
    startBtn: { paddingHorizontal: 48, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  });

  const currentTarget = targets[roundIdx];

  const counterColor =
    counter === currentTarget
      ? colors.accent
      : Math.abs(counter - currentTarget) <= 1
      ? colors.gold
      : colors.foreground;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1A140A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Number Catch — Round {roundIdx + 1}/{ROUNDS}</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.errRow}>
          {playerErrors.map((e, i) => (
            <View key={i} style={[styles.errDot, { backgroundColor: e === 0 ? colors.accent : e === 1 ? colors.gold : colors.destructive }]} />
          ))}
          {Array.from({ length: ROUNDS - playerErrors.length }).map((_, i) => (
            <View key={i + playerErrors.length} style={[styles.errDot, { backgroundColor: colors.muted }]} />
          ))}
        </View>

        <View style={styles.targetCard}>
          <Text style={styles.targetLabel}>CATCH THIS NUMBER</Text>
          <Text style={styles.targetNum}>{currentTarget}</Text>
        </View>

        <View style={[styles.counterDisc, {
          borderColor: phase === 'playing' ? counterColor : colors.border,
        }]}>
          {phase === 'intro' ? (
            <Text style={[styles.counterNum, { color: colors.mutedForeground, fontSize: 32 }]}>?</Text>
          ) : (
            <Text style={[styles.counterNum, { color: counterColor }]}>{counter}</Text>
          )}
        </View>

        {phase === 'intro' && (
          <Pressable style={styles.startBtn} onPress={() => setPhase('playing')}>
            <LinearGradient colors={[colors.gold, '#D97706']} style={{ padding: 16, borderRadius: 14, width: 200, alignItems: 'center' }}>
              <Text style={styles.tapBtnText}>Start Round</Text>
            </LinearGradient>
          </Pressable>
        )}

        {phase === 'playing' && (
          <Pressable onPress={handleTap} style={styles.tapBtn}>
            <LinearGradient colors={[colors.primary, '#4F1ADE']} style={{ padding: 16, borderRadius: 14, width: 200, alignItems: 'center' }}>
              <Text style={styles.tapBtnText}>TAP!</Text>
            </LinearGradient>
          </Pressable>
        )}

        {phase === 'feedback' && lastError !== null && (
          <Text style={[styles.feedbackText, {
            color: lastError === 0 ? colors.accent : lastError === 1 ? colors.gold : colors.destructive,
          }]}>
            {lastError === 0 ? 'Perfect!' : lastError === 1 ? `Off by ${lastError}` : `Off by ${lastError} — too slow!`}
          </Text>
        )}
      </View>
    </View>
  );
}
