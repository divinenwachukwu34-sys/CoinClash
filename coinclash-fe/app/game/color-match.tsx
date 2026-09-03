import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PALETTE = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#14B8A6' },
];

const ROUNDS = 8;
const PER_ROUND_TIME_MS = 3000; // 3.0 seconds per round

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound() {
  const shuffled = shuffle(PALETTE);
  const correct = shuffled[0];
  const options = shuffle([correct, shuffled[1], shuffled[2], shuffled[3]]);
  return { correct, options };
}

export default function ColorMatchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const rounds = useRef(Array.from({ length: ROUNDS }, buildRound));
  const [roundIdx, setRoundIdx] = useState(0);
  const [playerCorrect, setPlayerCorrect] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'timeout' | null>(null);

  // Timers
  const startTime = useRef(Date.now());
  const roundStartTime = useRef(Date.now());
  const [roundTimeLeft, setRoundTimeLeft] = useState(PER_ROUND_TIME_MS);
  const [elapsedSec, setElapsedSec] = useState('0.0');

  // AI parameters
  const aiCorrect = useRef(Math.floor(ROUNDS * (0.75 + Math.random() * 0.25)));
  const aiTime = useRef(ROUNDS * (1100 + Math.random() * 500)); // ~1.1-1.6s per round average for AI

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = rounds.current[roundIdx];

  // Advance to next round or finish
  const nextRound = useCallback(
    (isCorrect: boolean, timeSpentInRoundMs: number, isTimeout = false) => {
      const remainingMs = Math.max(0, PER_ROUND_TIME_MS - timeSpentInRoundMs);
      const speedBonus = isCorrect ? Math.round((remainingMs / PER_ROUND_TIME_MS) * 500) : 0;
      const roundPts = isCorrect ? 1000 + speedBonus : 0;

      const newCorrect = playerCorrect + (isCorrect ? 1 : 0);
      const newScore = playerScore + roundPts;

      setPlayerCorrect(newCorrect);
      setPlayerScore(newScore);

      setFeedback(isTimeout ? 'timeout' : isCorrect ? 'correct' : 'wrong');

      setTimeout(() => {
        setFeedback(null);
        if (roundIdx + 1 >= ROUNDS) {
          const totalTime = Date.now() - startTime.current;
          const won =
            newCorrect > aiCorrect.current ||
            (newCorrect === aiCorrect.current && totalTime < aiTime.current);
          const tieBreaker = newCorrect !== aiCorrect.current ? 'accuracy' : 'time';

          finish(won, totalTime, aiTime.current, 'ms', {
            playerAcc: `${newCorrect}/${ROUNDS}`,
            aiAcc: `${aiCorrect.current}/${ROUNDS}`,
            playerTimeMs: totalTime,
            aiTimeMs: aiTime.current,
            tieBreaker,
          });
        } else {
          setRoundIdx((r) => r + 1);
          roundStartTime.current = Date.now();
          setRoundTimeLeft(PER_ROUND_TIME_MS);
        }
      }, 350);
    },
    [roundIdx, playerCorrect, playerScore, finish]
  );

  // Handle user tap
  const handleAnswer = useCallback(
    (name: string) => {
      if (feedback !== null) return;
      const spent = Date.now() - roundStartTime.current;
      const isCorrect = name === current.correct.name;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      nextRound(isCorrect, spent, false);
    },
    [feedback, current, nextRound]
  );

  // Per-round countdown loop & total stopwatch
  useEffect(() => {
    const timer = setInterval(() => {
      const totalElapsed = (Date.now() - startTime.current) / 1000;
      setElapsedSec(totalElapsed.toFixed(1));

      if (feedback !== null) return;

      const roundSpent = Date.now() - roundStartTime.current;
      const left = Math.max(0, PER_ROUND_TIME_MS - roundSpent);
      setRoundTimeLeft(left);

      if (left <= 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        nextRound(false, PER_ROUND_TIME_MS, true);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [roundIdx, feedback, nextRound]);

  const timePct = roundTimeLeft / PER_ROUND_TIME_MS;
  const timerBarColor = timePct > 0.5 ? '#10B981' : timePct > 0.25 ? '#EAB308' : '#EF4444';

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 12 },
    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    stopwatch: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    stopwatchText: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_700Bold' },

    timerTrack: { height: 6, width: '100%', backgroundColor: colors.muted, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
    timerFill: { height: '100%', borderRadius: 3 },

    progress: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
    dot: { height: 4, borderRadius: 2 },
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 },
    question: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center' },
    colorCircle: { width: 140, height: 140, borderRadius: 70, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
    optionBtn: { width: '44%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 2 },
    optionText: { fontSize: 16, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
    scoreRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    scoreChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    scoreText: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  });

  const handleQuit = useCallback(() => {
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
            finish(false, 99999, 0, 'ms');
          },
        },
      ]
    );
  }, [finish]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2D0A2A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Color Match — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>

        {/* Rapid countdown bar for round */}
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${Math.max(0, timePct * 100)}%`, backgroundColor: timerBarColor }]} />
        </View>

        <View style={styles.progress}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, {
                width: i < roundIdx ? 16 : i === roundIdx ? 24 : 8,
                backgroundColor: i < roundIdx ? colors.accent : i === roundIdx ? current.correct.hex : colors.muted,
              }]}
            />
          ))}
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <Text style={styles.question}>
          {feedback === 'timeout' ? '⏰ TIME UP!' : 'What color is this?'}
        </Text>
        <View
          style={[
            styles.colorCircle,
            {
              backgroundColor: current.correct.hex,
              opacity: feedback === 'wrong' || feedback === 'timeout' ? 0.4 : 1,
            },
          ]}
        />
        <View style={styles.optionsGrid}>
          {current.options.map((opt) => {
            const isCorrect = opt.name === current.correct.name;
            const bgColor =
              feedback === null
                ? colors.card
                : isCorrect
                ? colors.accent + '30'
                : feedback === 'wrong'
                ? colors.destructive + '30'
                : colors.card;
            const borderColor =
              feedback === null ? colors.border : isCorrect ? colors.accent : colors.border;

            return (
              <Pressable
                key={opt.name}
                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleAnswer(opt.name)}
                disabled={feedback !== null}
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>{opt.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreChip, { backgroundColor: colors.accent + '20' }]}>
            <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
            <Text style={[styles.scoreText, { color: colors.accent }]}>Accuracy: {playerCorrect}/{ROUNDS}</Text>
          </View>
          <View style={[styles.scoreChip, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="flash" size={15} color={colors.primary} />
            <Text style={[styles.scoreText, { color: colors.primary }]}>{playerScore} pts</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
