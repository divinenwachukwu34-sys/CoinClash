import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WORD_BANK = [
  'APPLE', 'BEACH', 'CLOCK', 'DANCE', 'EAGLE', 'FLAME', 'GRAPE', 'HEART',
  'IMAGE', 'JEWEL', 'KNIFE', 'LEMON', 'MONEY', 'NIGHT', 'OCEAN', 'PIANO',
  'QUEEN', 'RIVER', 'SPACE', 'TIGER', 'UNION', 'VALVE', 'WATER', 'XENON',
  'YOUTH', 'BLAZE', 'CLOUD', 'DREAM', 'FROST', 'GLOBE', 'CROWN', 'FLASH',
  'GHOST', 'MAGIC', 'SHARK', 'STORM', 'SWORD', 'WORLD', 'ZILCH', 'TOWER',
];

const ROUNDS = 8;
const PER_WORD_TIME_MS = 4500; // 4.5 seconds per word

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
  const [playerScore, setPlayerScore] = useState(0);
  const [feedback, setFeedback] = useState<string | 'timeout' | null>(null);

  // Timers
  const startTime = useRef(Date.now());
  const roundStartTime = useRef(Date.now());
  const [roundTimeLeft, setRoundTimeLeft] = useState(PER_WORD_TIME_MS);
  const [elapsedSec, setElapsedSec] = useState('0.0');

  const aiCorrect = useRef(Math.floor(ROUNDS * (0.75 + Math.random() * 0.25)));
  const aiTime = useRef(ROUNDS * (1600 + Math.random() * 800));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const current = rounds[roundIdx];

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

  const nextWord = useCallback(
    (isCorrect: boolean, timeSpentMs: number, optChosen: string | 'timeout') => {
      const remainingMs = Math.max(0, PER_WORD_TIME_MS - timeSpentMs);
      const speedBonus = isCorrect ? Math.round((remainingMs / PER_WORD_TIME_MS) * 500) : 0;
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
          setRoundTimeLeft(PER_WORD_TIME_MS);
        }
      }, 400);
    },
    [roundIdx, playerCorrect, playerScore, finish]
  );

  const handleAnswer = useCallback(
    (opt: string) => {
      if (feedback !== null) return;
      const spent = Date.now() - roundStartTime.current;
      const isCorrect = opt === current.word;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      nextWord(isCorrect, spent, opt);
    },
    [feedback, current, nextWord]
  );

  // Per-word timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      const totalElapsed = (Date.now() - startTime.current) / 1000;
      setElapsedSec(totalElapsed.toFixed(1));

      if (feedback !== null) return;

      const roundSpent = Date.now() - roundStartTime.current;
      const left = Math.max(0, PER_WORD_TIME_MS - roundSpent);
      setRoundTimeLeft(left);

      if (left <= 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        nextWord(false, PER_WORD_TIME_MS, 'timeout');
      }
    }, 50);

    return () => clearInterval(timer);
  }, [roundIdx, feedback, nextWord]);

  const timePct = roundTimeLeft / PER_WORD_TIME_MS;
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

    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
    scrambleCard: {
      width: '100%', backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 32,
      alignItems: 'center', gap: 8,
    },
    scrambleLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
    scrambledWord: { fontSize: 40, fontWeight: '800' as const, color: colors.gold, fontFamily: 'Inter_700Bold', letterSpacing: 6 },
    optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
    optionBtn: { width: '44%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', borderWidth: 2 },
    optionText: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },

    scoreRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    scoreChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    scoreText: { fontSize: 13, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1E293B', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Word Scramble — {roundIdx + 1}/{ROUNDS}</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>

        {/* Word countdown bar */}
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${Math.max(0, timePct * 100)}%`, backgroundColor: timerBarColor }]} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.scrambleCard}>
          <Text style={styles.scrambleLabel}>UNSCRAMBLE THE WORD</Text>
          <Text style={styles.scrambledWord}>
            {feedback === 'timeout' ? '⏰ EXPIRED' : current.scrambledWord}
          </Text>
        </View>

        <View style={styles.optionsGrid}>
          {current.options.map((opt) => {
            const isCorrect = opt === current.word;
            const isTapped = feedback === opt;
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
                key={opt}
                style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                onPress={() => handleAnswer(opt)}
                disabled={feedback !== null}
              >
                <Text style={[styles.optionText, { color: colors.foreground }]}>{opt}</Text>
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
      </View>
    </View>
  );
}
