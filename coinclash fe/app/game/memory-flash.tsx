import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TILE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
const SEQ_LENGTH = 4;

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
  const startTime = useRef(0);
  const aiTime = useRef(Math.round(3500 + Math.random() * 2000)); // 3.5-5.5s

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
          }, 200);
        }, 500);
      } else {
        setPhase('input');
        startTime.current = Date.now();
      }
    };
    setTimeout(show, 600);
  }, []);

  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(startShowing, 800);
      return () => clearTimeout(t);
    }
  }, [phase, startShowing]);

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
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
    phaseLabel: { fontSize: 20, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
    sub: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: -20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: TILE_SIZE * 2 + 12, justifyContent: 'center' },
    tile: { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 16 },
    progress: { flexDirection: 'row', gap: 6 },
    progressDot: { width: 10, height: 10, borderRadius: 5 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1A0A3A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Memory Flash</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        {phase === 'intro' && <Text style={styles.phaseLabel}>Watch the sequence!</Text>}
        {phase === 'showing' && <Text style={styles.phaseLabel}>Memorize...</Text>}
        {phase === 'input' && <Text style={styles.phaseLabel}>Repeat it!</Text>}
        {phase === 'done' && <Text style={styles.phaseLabel}>Done!</Text>}

        <View style={styles.grid}>
          {TILE_COLORS.map((hex, i) => {
            const isHighlighted = highlightIdx === i;
            const isInputted = inputSeq.includes(i) && phase === 'input';
            return (
              <Pressable
                key={i}
                style={[
                  styles.tile,
                  {
                    backgroundColor: isHighlighted ? hex : hex + '40',
                    borderWidth: isHighlighted ? 3 : 1,
                    borderColor: isHighlighted ? '#fff' : hex + '60',
                    transform: [{ scale: isHighlighted ? 1.05 : 1 }],
                    opacity: phase !== 'input' ? 0.8 : 1,
                  },
                ]}
                onPress={() => handleTile(i)}
              />
            );
          })}
        </View>

        <View style={styles.progress}>
          {Array.from({ length: SEQ_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.progressDot, {
              backgroundColor: i < inputSeq.length ? colors.accent : colors.muted,
            }]} />
          ))}
        </View>

        <Text style={styles.sub}>
          {phase === 'showing'
            ? `Showing: ${highlightIdx >= 0 ? highlightIdx + 1 : '...'}`
            : phase === 'input'
            ? `Tap ${SEQ_LENGTH - inputSeq.length} more tiles`
            : ''}
        </Text>
      </View>
    </View>
  );
}
