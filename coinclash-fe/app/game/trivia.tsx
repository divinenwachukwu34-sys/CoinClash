import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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

const ROUNDS = 5;

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
  const [feedback, setFeedback] = useState<number | null>(null);
  const startTime = useRef(Date.now());

  const aiCorrect = useRef(Math.floor(ROUNDS * (0.5 + Math.random() * 0.35)));
  const aiTime = useRef(ROUNDS * (2000 + Math.random() * 1000));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = questions.current[roundIdx];

  const handleAnswer = useCallback(
    (optIdx: number) => {
      if (feedback !== null) return;
      const isCorrect = optIdx === current.correct;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      setFeedback(optIdx);
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
      }, 700);
    },
    [feedback, current, playerCorrect, roundIdx, finish]
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
    progress: { flexDirection: 'row', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    questionCard: {
      width: '100%', backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 24,
    },
    qNum: { fontSize: 12, color: '#A78BFA', fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    question: { fontSize: 19, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Inter_600SemiBold', lineHeight: 26 },
    options: { width: '100%', gap: 10 },
    optionBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 10 },
    optionText: { fontSize: 15, fontFamily: 'Inter_500Medium', flex: 1 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#120A2A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Trivia Clash — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.progress}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i < roundIdx ? colors.accent : i === roundIdx ? '#A78BFA' : colors.muted,
            }]} />
          ))}
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.qNum}>Question {roundIdx + 1}</Text>
          <Text style={styles.question}>{current.q}</Text>
        </View>

        <View style={styles.options}>
          {current.opts.map((opt, i) => {
            const isChosen = feedback === i;
            const isCorrect = i === current.correct;
            const bgColor = feedback === null ? colors.card : isCorrect ? colors.accent + '30' : isChosen ? colors.destructive + '30' : colors.card;
            const borderColor = feedback === null ? colors.border : isCorrect ? colors.accent : isChosen ? colors.destructive : colors.border;
            const textColor = feedback === null ? colors.foreground : isCorrect ? colors.accent : isChosen ? colors.destructive : colors.mutedForeground;
            return (
              <Pressable key={i} style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]} onPress={() => handleAnswer(i)}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13,
                  backgroundColor: (isCorrect && feedback !== null) ? colors.accent : (isChosen && !isCorrect) ? colors.destructive : colors.muted,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' }}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
          Score: {playerCorrect} correct
        </Text>
      </ScrollView>
    </View>
  );
}
