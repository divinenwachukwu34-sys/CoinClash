import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROUNDS = 5;

function buildProblem() {
  const ops = ['+', '-', '×'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number;
  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 5;
    b = Math.floor(Math.random() * 20) + 5;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 20) + 15;
    b = Math.floor(Math.random() * 15) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
  }
  const wrongs = new Set<number>();
  while (wrongs.size < 3) {
    const delta = Math.floor(Math.random() * 10) - 5;
    const w = answer + delta;
    if (w !== answer && w > 0) wrongs.add(w);
  }
  const options = [answer, ...Array.from(wrongs)].sort(() => Math.random() - 0.5);
  return { question: `${a} ${op} ${b} = ?`, answer, options };
}

export default function MathDuelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const problems = useRef(Array.from({ length: ROUNDS }, buildProblem));
  const [roundIdx, setRoundIdx] = useState(0);
  const [playerCorrect, setPlayerCorrect] = useState(0);
  const [feedback, setFeedback] = useState<number | null>(null); // tapped option
  const startTime = useRef(Date.now());

  const aiCorrect = useRef(Math.floor(ROUNDS * (0.75 + Math.random() * 0.25)));
  const aiTime = useRef(ROUNDS * (750 + Math.random() * 400));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = problems.current[roundIdx];

  const handleAnswer = useCallback(
    (opt: number) => {
      if (feedback !== null) return;
      const isCorrect = opt === current.answer;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      setFeedback(opt);
      const newCorrect = playerCorrect + (isCorrect ? 1 : 0);

      setTimeout(() => {
        setFeedback(null);
        if (roundIdx + 1 >= ROUNDS) {
          const elapsed = Date.now() - startTime.current;
          const won =
            newCorrect > aiCorrect.current ||
            (newCorrect === aiCorrect.current && elapsed < aiTime.current);
          finish(won, newCorrect, aiCorrect.current, 'pts');
        } else {
          setRoundIdx((r) => r + 1);
          setPlayerCorrect(newCorrect);
        }
      }, 500);
    },
    [feedback, current, playerCorrect, roundIdx, finish]
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 36, paddingHorizontal: 24 },
    problemCard: {
      width: '100%', backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 32,
      alignItems: 'center',
    },
    problem: { fontSize: 44, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
    optionBtn: { width: '44%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', borderWidth: 2 },
    optionText: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
    progress: { flexDirection: 'row', gap: 8, marginTop: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A1A3A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Math Duel — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.progress}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i < roundIdx ? colors.accent : i === roundIdx ? '#3B82F6' : colors.muted,
            }]} />
          ))}
        </View>

        <View style={styles.problemCard}>
          <Text style={styles.problem}>{current.question}</Text>
        </View>

        <View style={styles.optionsGrid}>
          {current.options.map((opt) => {
            const isChosen = feedback === opt;
            const isCorrect = opt === current.answer;
            const bgColor =
              feedback === null ? colors.card
                : isCorrect ? colors.accent + '30'
                : isChosen ? colors.destructive + '30'
                : colors.card;
            const borderColor =
              feedback === null ? colors.border
                : isCorrect ? colors.accent
                : isChosen ? colors.destructive
                : colors.border;
            const textColor =
              feedback === null ? colors.foreground
                : isCorrect ? colors.accent
                : isChosen ? colors.destructive
                : colors.mutedForeground;

            return (
              <Pressable key={opt} style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]} onPress={() => handleAnswer(opt)}>
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
          Score: {playerCorrect} correct
        </Text>
      </View>
    </View>
  );
}
