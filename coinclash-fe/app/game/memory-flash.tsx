import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TILE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
const SEQ_LENGTH = 5;

function buildSequence(): number[] {
  return Array.from({ length: SEQ_LENGTH }, () => Math.floor(Math.random() * 6));
}

type Phase = 'intro' | 'showing' | 'input' | 'done';

export default function MemoryFlashScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const sequence = useRef(buildSequence());
  const [phase, setPhase] = useState<Phase>('intro');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [inputSeq, setInputSeq] = useState<number[]>([]);

  // Timers
  const startTime = useRef(0);
  const [elapsedSec, setElapsedSec] = useState('0.00');
  const aiTime = useRef(Math.round(2800 + Math.random() * 1400)); // ~2.8-4.2s for AI

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const startShowing = useCallback(() => {
    setPhase('showing');
    setHighlightIdx(-1);
    let idx = 0;
    const show = () => {
      if (idx < sequence.current.length) {
        setHighlightIdx(sequence.current[idx]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => {
          setHighlightIdx(-1);
          setTimeout(() => {
            idx++;
            show();
          }, 180);
        }, 450);
      } else {
        setPhase('input');
        startTime.current = Date.now();
      }
    };
    setTimeout(show, 500);
  }, []);

  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(startShowing, 600);
      return () => clearTimeout(t);
    }
  }, [phase, startShowing]);

  // Live stopwatch tick during input phase
  useEffect(() => {
    if (phase !== 'input') return;
    const timer = setInterval(() => {
      const spent = (Date.now() - startTime.current) / 1000;
      setElapsedSec(spent.toFixed(2));
    }, 30);
    return () => clearInterval(timer);
  }, [phase]);

  const handleTile = useCallback(
    (tileIdx: number) => {
      if (phase !== 'input') return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newInput = [...inputSeq, tileIdx];
      setInputSeq(newInput);

      const pos = newInput.length - 1;
      if (newInput[pos] !== sequence.current[pos]) {
        // Wrong tile
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPhase('done');
        finish(false, 9999, aiTime.current, 'ms');
        return;
      }

      if (newInput.length === SEQ_LENGTH) {
        const elapsed = Date.now() - startTime.current;
        const won = elapsed < aiTime.current;
        setPhase('done');
        setTimeout(() => finish(won, elapsed, aiTime.current, 'ms'), 300);
      }
    },
    [phase, inputSeq, finish]
  );

  const TILE_SIZE = 110;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    stopwatch: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    stopwatchText: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_700Bold' },

    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
    instruction: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: TILE_SIZE * 3 + 24, gap: 12, justifyContent: 'center' },
    tile: {
      width: TILE_SIZE, height: TILE_SIZE, borderRadius: 18,
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    progressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
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
      <LinearGradient colors={['#0F172A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Memory Flash</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <Text style={styles.instruction}>
          {phase === 'intro' && 'Get ready... Memorize the sequence!'}
          {phase === 'showing' && 'Watch carefully...'}
          {phase === 'input' && 'TAP THE SEQUENCE IN ORDER! FAST TIME WINS!'}
          {phase === 'done' && 'Sequence finished!'}
        </Text>

        <View style={styles.grid}>
          {TILE_COLORS.map((col, idx) => {
            const isLit = highlightIdx === idx;
            return (
              <Pressable
                key={idx}
                style={[
                  styles.tile,
                  {
                    backgroundColor: col,
                    opacity: isLit ? 1 : phase === 'input' ? 0.85 : 0.25,
                    transform: [{ scale: isLit ? 1.08 : 1 }],
                  },
                ]}
                onPress={() => handleTile(idx)}
                disabled={phase !== 'input'}
              />
            );
          })}
        </View>

        <View style={styles.progressRow}>
          {Array.from({ length: SEQ_LENGTH }).map((_, i) => {
            const filled = i < inputSeq.length;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: filled ? colors.accent : 'transparent',
                    borderColor: filled ? colors.accent : colors.muted,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}
