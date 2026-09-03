import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ALL_QUESTIONS = [
  { q: 'What is the capital of France?', opts: ['London', 'Paris', 'Berlin', 'Rome'], correct: 1 },
  { q: 'How many sides does a hexagon have?', opts: ['5', '6', '7', '8'], correct: 1 },
  { q: 'What is the largest planet in our solar system?', opts: ['Saturn', 'Neptune', 'Jupiter', 'Uranus'], correct: 2 },
  { q: 'Who painted the Mona Lisa?', opts: ['Picasso', 'Michelangelo', 'Da Vinci', 'Rembrandt'], correct: 2 },
  { q: 'What is the chemical symbol for gold?', opts: ['Ag', 'Au', 'Gd', 'Go'], correct: 1 },
  { q: 'How many continents are there?', opts: ['5', '6', '7', '8'], correct: 2 },
  { q: 'What is the speed of light?', opts: ['300,000 km/s', '150,000 km/s', '450,000 km/s', '200,000 km/s'], correct: 0 },
  { q: 'Which element has the symbol H?', opts: ['Helium', 'Hydrogen', 'Hafnium', 'Holmium'], correct: 1 },
  { q: 'What year did World War II end?', opts: ['1943', '1944', '1945', '1946'], correct: 2 },
  { q: 'How many bones are in the adult human body?', opts: ['196', '206', '216', '226'], correct: 1 },
  { q: 'What is the smallest country in the world?', opts: ['Monaco', 'San Marino', 'Liechtenstein', 'Vatican City'], correct: 3 },
  { q: 'Which planet is known as the Red Planet?', opts: ['Venus', 'Mars', 'Mercury', 'Saturn'], correct: 1 },
  { q: 'What is the hardest natural substance?', opts: ['Gold', 'Iron', 'Diamond', 'Platinum'], correct: 2 },
  { q: 'How many strings does a standard guitar have?', opts: ['4', '5', '6', '7'], correct: 2 },
  { q: 'What language has the most native speakers?', opts: ['English', 'Spanish', 'Hindi', 'Mandarin'], correct: 3 },
];

const ROUNDS = 8;
const PER_QUESTION_TIME_MS = 5000; // 5.0s per question

function pickQuestions() {
  return [...ALL_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, ROUNDS);
}

export default function TriviaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const questions = useRef(pickQuestions());
  const [roundIdx, setRoundIdx] = useState(0);
  const [playerCorrect, setPlayerCorrect] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [feedback, setFeedback] = useState<number | 'timeout' | null>(null);

  // Timers
  const startTime = useRef(Date.now());
  const roundStartTime = useRef(Date.now());
  const [roundTimeLeft, setRoundTimeLeft] = useState(PER_QUESTION_TIME_MS);
  const [elapsedSec, setElapsedSec] = useState('0.0');

  // AI parameters
  const aiCorrect = useRef(Math.floor(ROUNDS * (0.6 + Math.random() * 0.35)));
  const aiTime = useRef(ROUNDS * (2200 + Math.random() * 800));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = questions.current[roundIdx];

  const nextQuestion = useCallback(
    (isCorrect: boolean, timeSpentMs: number, optChosen: number | 'timeout') => {
      const remainingMs = Math.max(0, PER_QUESTION_TIME_MS - timeSpentMs);
      const speedBonus = isCorrect ? Math.round((remainingMs / PER_QUESTION_TIME_MS) * 500) : 0;
      const roundPts = isCorrect ? 1000 + speedBonus : 0;

      const newCorrect = playerCorrect + (isCorrect ? 1 : 0);
      const newScore = playerScore + roundPts;

      setPlayerCorrect(newCorrect);
      setPlayerScore(newScore);
      setFeedback(optChosen);

      setTimeout(() => {
        setFeedback(null);
        if (roundIdx + 1 >= ROUNDS) {
          const totalTime = Date.now() - startTime.current;
          const won =
            newCorrect > aiCorrect.current ||
            (newCorrect === aiCorrect.current && totalTime < aiTime.current);

          finish(won, totalTime, aiTime.current, 'ms');
        } else {
          setRoundIdx((r) => r + 1);
          roundStartTime.current = Date.now();
          setRoundTimeLeft(PER_QUESTION_TIME_MS);
        }
      }, 400);
    },
    [roundIdx, playerCorrect, playerScore, finish]
  );

  const handleAnswer = useCallback(
    (optIdx: number) => {
      if (feedback !== null) return;
      const spent = Date.now() - roundStartTime.current;
      const isCorrect = optIdx === current.correct;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      nextQuestion(isCorrect, spent, optIdx);
    },
    [feedback, current, nextQuestion]
  );

  // Per-question timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      const totalElapsed = (Date.now() - startTime.current) / 1000;
      setElapsedSec(totalElapsed.toFixed(1));

      if (feedback !== null) return;

      const roundSpent = Date.now() - roundStartTime.current;
      const left = Math.max(0, PER_QUESTION_TIME_MS - roundSpent);
      setRoundTimeLeft(left);

      if (left <= 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        nextQuestion(false, PER_QUESTION_TIME_MS, 'timeout');
      }
    }, 50);

    return () => clearInterval(timer);
  }, [roundIdx, feedback, nextQuestion]);

  const timePct = roundTimeLeft / PER_QUESTION_TIME_MS;
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

    body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
    qCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24, marginBottom: 20 },
    qText: { fontSize: 20, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold', lineHeight: 28 },

    optList: { gap: 12 },
    optBtn: { padding: 18, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 12 },
    optLabel: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
    optLabelText: { fontSize: 14, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    optText: { flex: 1, fontSize: 16, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },

    scoreRow: { flexDirection: 'row', gap: 10, marginTop: 20, justifyContent: 'center' },
    scoreChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    scoreText: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1E1B4B', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Trivia — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>

        {/* Question countdown bar */}
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${Math.max(0, timePct * 100)}%`, backgroundColor: timerBarColor }]} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.qCard}>
          <Text style={styles.qText}>
            {feedback === 'timeout' ? '⏰ TIME EXPIRED!' : current.q}
          </Text>
        </View>

        <View style={styles.optList}>
          {current.opts.map((opt, i) => {
            const isCorrect = i === current.correct;
            const isTapped = feedback === i;
            const bgColor =
              feedback === null
                ? colors.card
                : isCorrect
                ? colors.accent + '30'
                : isTapped
                ? colors.destructive + '30'
                : colors.card;
            const borderColor =
              feedback === null ? colors.border : isCorrect ? colors.accent : isTapped ? colors.destructive : colors.border;

            return (
              <Pressable
                key={i}
                style={[styles.optBtn, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleAnswer(i)}
                disabled={feedback !== null}
              >
                <View style={styles.optLabel}>
                  <Text style={styles.optLabelText}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={styles.optText}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreChip, { backgroundColor: colors.accent + '20' }]}>
            <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
            <Text style={[styles.scoreText, { color: colors.accent }]}>Score: {playerCorrect}/{ROUNDS}</Text>
          </View>
          <View style={[styles.scoreChip, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="flash" size={15} color={colors.primary} />
            <Text style={[styles.scoreText, { color: colors.primary }]}>{playerScore} pts</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
