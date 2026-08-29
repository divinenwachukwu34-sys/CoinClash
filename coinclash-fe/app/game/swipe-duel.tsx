import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];
const SWIPES = 5;

const ICON_MAP: Record<Direction, keyof typeof Ionicons.glyphMap> = {
  up: 'arrow-up',
  down: 'arrow-down',
  left: 'arrow-back',
  right: 'arrow-forward',
};

function buildSequence(): Direction[] {
  return Array.from({ length: SWIPES }, () => DIRECTIONS[Math.floor(Math.random() * 4)]);
}

export default function SwipeDuelScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const sequence = useRef(buildSequence());
  const [swipeIdx, setSwipeIdx] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>('intro');
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | null>(null);
  const startTime = useRef(0);
  const aiTime = useRef(Math.round(2000 + Math.random() * 2000));
  const swipeIdxRef = useRef(0);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    swipeIdxRef.current = swipeIdx;
  }, [swipeIdx]);

  const handleSwipe = useCallback(
    (dir: Direction) => {
      if (phase !== 'playing') return;
      const expected = sequence.current[swipeIdxRef.current];
      const isCorrect = dir === expected;
      Haptics.impactAsync(isCorrect ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
      setLastResult(isCorrect ? 'correct' : 'wrong');

      setTimeout(() => {
        setLastResult(null);
        if (isCorrect) {
          const next = swipeIdxRef.current + 1;
          if (next >= SWIPES) {
            const elapsed = Date.now() - startTime.current;
            const won = elapsed < aiTime.current;
            setPhase('done');
            finish(won, elapsed, aiTime.current, 'ms');
          } else {
            setSwipeIdx(next);
          }
        }
      }, 200);
    },
    [phase, finish]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        const { dx, dy } = gs;
        const THRESHOLD = 40;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > THRESHOLD) handleSwipe('right');
          else if (dx < -THRESHOLD) handleSwipe('left');
        } else {
          if (dy > THRESHOLD) handleSwipe('down');
          else if (dy < -THRESHOLD) handleSwipe('up');
        }
      },
    })
  ).current;

  // Also support tap-based direction buttons for web
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 16 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 40, paddingHorizontal: 24 },
    arrowCard: {
      width: 160, height: 160, borderRadius: 80,
      backgroundColor: colors.card, borderWidth: 3,
      alignItems: 'center', justifyContent: 'center',
    },
    progress: { flexDirection: 'row', gap: 8 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    swipeZone: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
    swipeHint: { color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_400Regular' },
    btnRow: { flexDirection: 'row', gap: 12 },
    dirBtn: { width: 70, height: 70, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    startBtn: {
      paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14,
      alignItems: 'center',
    },
    startBtnText: { fontSize: 18, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' },
  });

  const currentDir = sequence.current[swipeIdx];
  const borderColor =
    lastResult === 'correct' ? colors.accent : lastResult === 'wrong' ? colors.destructive : colors.border;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A2A1A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Swipe Duel — {swipeIdx + 1}/{SWIPES}</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <View style={styles.progress}>
          {Array.from({ length: SWIPES }).map((_, i) => (
            <View key={i} style={[styles.dot, {
              backgroundColor: i < swipeIdx ? colors.accent : i === swipeIdx ? '#10B981' : colors.muted,
            }]} />
          ))}
        </View>

        <View style={[styles.arrowCard, { borderColor }]}>
          {phase === 'intro' ? (
            <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Ready?</Text>
          ) : (
            <Ionicons name={ICON_MAP[currentDir]} size={72} color={colors.foreground} />
          )}
        </View>

        {phase === 'intro' && (
          <Pressable
            style={styles.startBtn}
            onPress={() => { setPhase('playing'); startTime.current = Date.now(); }}
          >
            <LinearGradient colors={[colors.accent, '#059669']} style={{ padding: 16, borderRadius: 14, width: 160, alignItems: 'center' }}>
              <Text style={styles.startBtnText}>Start!</Text>
            </LinearGradient>
          </Pressable>
        )}

        {phase === 'playing' && (
          <>
            <View style={styles.swipeZone} {...panResponder.panHandlers}>
              <Text style={styles.swipeHint}>Swipe in the direction of the arrow</Text>
            </View>
            {/* Direction buttons for web */}
            <View style={{ gap: 8, alignItems: 'center' }}>
              <View style={styles.btnRow}>
                <View style={{ width: 70 }} />
                <Pressable style={styles.dirBtn} onPress={() => handleSwipe('up')}>
                  <Ionicons name="arrow-up" size={28} color={colors.foreground} />
                </Pressable>
                <View style={{ width: 70 }} />
              </View>
              <View style={styles.btnRow}>
                <Pressable style={styles.dirBtn} onPress={() => handleSwipe('left')}>
                  <Ionicons name="arrow-back" size={28} color={colors.foreground} />
                </Pressable>
                <Pressable style={styles.dirBtn} onPress={() => handleSwipe('down')}>
                  <Ionicons name="arrow-down" size={28} color={colors.foreground} />
                </Pressable>
                <Pressable style={styles.dirBtn} onPress={() => handleSwipe('right')}>
                  <Ionicons name="arrow-forward" size={28} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
