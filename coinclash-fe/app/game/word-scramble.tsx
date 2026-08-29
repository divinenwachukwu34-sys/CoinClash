import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WORD_BANK = [
  'APPLE', 'BEACH', 'CLOCK', 'DANCE', 'EAGLE',
  'FLAME', 'GRAPE', 'HEART', 'IMAGE', 'JEWEL',
  'KNIFE', 'LEMON', 'MONEY', 'NIGHT', 'OCEAN',
  'PIANO', 'QUEEN', 'RIVER', 'SPACE', 'TIGER',
  'UNION', 'VALVE', 'WATER', 'XENON', 'YOUTH',
  'BLAZE', 'CLOUD', 'DREAM', 'FROST', 'GLOBE',
];

const ROUNDS = 5;

function scramble(word: string): string {
  const arr = word.split('');
  let attempts = 0;
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    attempts++;
  } while (arr.join('') === word && attempts < 20);
  return arr.join('');
}

function buildRound(usedIdx: number[]) {
  const available = WORD_BANK.filter((_, i) => !usedIdx.includes(i));
  const poolIdx = Math.floor(Math.random() * available.length);
  const word = available[poolIdx];
  const wordIdx = WORD_BANK.indexOf(word);

  const wrongPool = WORD_BANK.filter((_, i) => i !== wordIdx && !usedIdx.includes(i));
  const wrongs = wrongPool.sort(() => Math.random() - 0.5).slice(0, 3);

  const options = [word, ...wrongs].sort(() => Math.random() - 0.5);
  return { word, scrambledWord: scramble(word), options, wordIdx };
}

export default function WordScrambleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const usedIdx = useRef<number[]>([]);
  const [rounds] = useState(() => {
    const rs = [];
    for (let i = 0; i < ROUNDS; i++) {
      const r = buildRound(usedIdx.current);
      usedIdx.current.push(r.wordIdx);
      rs.push(r);
    }
    return rs;
  });

  const [roundIdx, setRoundIdx] = useState(0);
  const [playerCorrect, setPlayerCorrect] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  const aiCorrect = useRef(Math.floor(ROUNDS * (0.75 + Math.random() * 0.25)));
  const aiTime = useRef(ROUNDS * (1100 + Math.random() * 800));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = rounds[roundIdx];

  const handleAnswer = useCallback(
    (opt: string) => {
      if (feedback !== null) return;
      const isCorrect = opt === current.word;
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
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
    scrambledCard: {
      width: '100%', backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 28, alignItems: 'center', gap: 8,
    },
    label: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', letterSpacing: 1, textTransform: 'uppercase' },
    scrambled: { fontSize: 42, fontWeight: '700' as const, color: '#14B8A6', fontFamily: 'Inter_700Bold', letterSpacing: 4 },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
    optionBtn: { width: '44%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 2 },
    optionText: { fontSize: 15, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
    progress: { flexDirection: 'row', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A2A2A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Word Scramble — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.progress}>
          {Array.from({ length: ROUNDS }).map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i < roundIdx ? colors.accent : i === roundIdx ? '#14B8A6' : colors.muted,
            }]} />
          ))}
        </View>

        <View style={styles.scrambledCard}>
          <Text style={styles.label}>Unscramble this word</Text>
          <Text style={styles.scrambled}>{current.scrambledWord}</Text>
        </View>

        <View style={styles.optionsGrid}>
          {current.options.map((opt) => {
            const isChosen = feedback === opt;
            const isCorrect = opt === current.word;
            const bgColor = feedback === null ? colors.card : isCorrect ? colors.accent + '30' : isChosen ? colors.destructive + '30' : colors.card;
            const borderColor = feedback === null ? colors.border : isCorrect ? colors.accent : isChosen ? colors.destructive : colors.border;
            const textColor = feedback === null ? colors.foreground : isCorrect ? colors.accent : isChosen ? colors.destructive : colors.mutedForeground;
            return (
              <Pressable key={opt} style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]} onPress={() => handleAnswer(opt)}>
                <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
          Score: {playerCorrect}/{ROUNDS}
        </Text>
      </View>
    </View>
  );
}
