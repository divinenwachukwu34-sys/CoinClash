import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

const ROUNDS = 5;

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
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const startTime = useRef(Date.now());
  const roundStartTime = useRef(Date.now());

  // Pre-compute AI result
  const aiCorrect = useRef(Math.floor(ROUNDS * (0.7 + Math.random() * 0.25)));
  const aiTime = useRef(ROUNDS * (600 + Math.random() * 400));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = rounds.current[roundIdx];

  const handleAnswer = useCallback(
    (name: string) => {
      if (feedback !== null) return;
      const isCorrect = name === current.correct.name;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      setFeedback(isCorrect ? 'correct' : 'wrong');
      const newCorrect = playerCorrect + (isCorrect ? 1 : 0);

      setTimeout(() => {
        setFeedback(null);
        if (roundIdx + 1 >= ROUNDS) {
          const totalTime = Date.now() - startTime.current;
          const won = newCorrect > aiCorrect.current || (newCorrect === aiCorrect.current && totalTime < aiTime.current);
          finish(won, newCorrect, aiCorrect.current, 'pts');
        } else {
          setRoundIdx((r) => r + 1);
          setPlayerCorrect(newCorrect);
          roundStartTime.current = Date.now();
        }
      }, 400);
    },
    [feedback, current, playerCorrect, roundIdx, finish]
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    progress: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    dot: { height: 4, borderRadius: 2 },
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
    question: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center' },
    colorCircle: { width: 130, height: 130, borderRadius: 65, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
    optionBtn: { width: '44%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
    optionText: { fontSize: 15, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
    scoreRow: { flexDirection: 'row', gap: 8 },
    scoreChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    scoreText: { fontSize: 13, fontWeight: '600' as const, fontFamily: 'Inter_600SemiBold' },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2D0A2A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Color Match — Round {roundIdx + 1}/{ROUNDS}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.progress}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, {
                width: i < roundIdx ? 20 : 12,
                backgroundColor: i < roundIdx ? colors.accent : i === roundIdx ? current.correct.hex : colors.muted,
              }]}
            />
          ))}
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <Text style={styles.question}>What color is this?</Text>
        <View
          style={[
            styles.colorCircle,
            {
              backgroundColor: current.correct.hex,
              opacity: feedback === 'wrong' ? 0.5 : 1,
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
                : feedback === 'wrong' && opt.name === current.options.find(o => o.name !== current.correct.name)?.name
                ? colors.destructive + '30'
                : colors.card;
            const borderColor =
              feedback === null ? colors.border : isCorrect ? colors.accent : colors.border;

            return (
              <Pressable
                key={opt.name}
                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleAnswer(opt.name)}
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>{opt.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.scoreRow}>
          <View style={[styles.scoreChip, { backgroundColor: colors.accent + '20' }]}>
            <Text style={[styles.scoreText, { color: colors.accent }]}>You: {playerCorrect}/{ROUNDS}</Text>
          </View>
          <View style={[styles.scoreChip, { backgroundColor: colors.destructive + '20' }]}>
            <Text style={[styles.scoreText, { color: colors.destructive }]}>AI: ?/{ROUNDS}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
