import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
type Direction = (typeof DIRECTIONS)[number];

const SWIPES = 16; // Over 15 fast swipes!
const PER_SWIPE_TIME_MS = 2500; // 2.5 seconds per swipe

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
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | 'timeout' | null>(null);

  // Timers
  const startTime = useRef(0);
  const swipeStartTime = useRef(0);
  const [swipeTimeLeft, setSwipeTimeLeft] = useState(PER_SWIPE_TIME_MS);
  const [elapsedSec, setElapsedSec] = useState('0.00');

  const aiTime = useRef(Math.round(4200 + Math.random() * 2500)); // ~4.2-6.7s total for AI
  const swipeIdxRef = useRef(0);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    swipeIdxRef.current = swipeIdx;
  }, [swipeIdx]);

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

  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(() => {
        setPhase('playing');
        startTime.current = Date.now();
        swipeStartTime.current = Date.now();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Live stopwatch and per-swipe timer tick
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const spentTotal = (Date.now() - startTime.current) / 1000;
      setElapsedSec(spentTotal.toFixed(2));

      if (lastResult !== null) return;

      const spentSwipe = Date.now() - swipeStartTime.current;
      const left = Math.max(0, PER_SWIPE_TIME_MS - spentSwipe);
      setSwipeTimeLeft(left);

      if (left <= 0) {
        // Swipe timed out -> wrong swipe!
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLastResult('timeout');
        setTimeout(() => {
          setLastResult(null);
          swipeStartTime.current = Date.now();
          setSwipeTimeLeft(PER_SWIPE_TIME_MS);
        }, 200);
      }
    }, 30);
    return () => clearInterval(timer);
  }, [phase, lastResult]);

  const handleSwipe = useCallback(
    (dir: Direction) => {
      if (phase !== 'playing' || lastResult !== null) return;
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
            swipeStartTime.current = Date.now();
            setSwipeTimeLeft(PER_SWIPE_TIME_MS);
          }
        }
      }, 150);
    },
    [phase, lastResult, finish]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderRelease: (_, gs) => {
        const { dx, dy } = gs;
        const THRESHOLD = 35;
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

  const currentDir = sequence.current[swipeIdx];
  const timePct = swipeTimeLeft / PER_SWIPE_TIME_MS;
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

    arena: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
    instruction: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center' },
    arrowCard: {
      width: 170, height: 170, borderRadius: 85,
      backgroundColor: colors.card, borderWidth: 4,
      borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    },
    controlsGrid: { gap: 10, alignItems: 'center', marginTop: 10 },
    row: { flexDirection: 'row', gap: 16 },
    dirBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

    progressRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 20 },
    dot: { width: 12, height: 4, borderRadius: 2 },
  });

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <LinearGradient colors={['#1E1B4B', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Swipe Duel — {swipeIdx + 1}/{SWIPES}</Text>
          <View style={styles.stopwatch}>
            <Ionicons name="stopwatch-outline" size={14} color={colors.primary} />
            <Text style={styles.stopwatchText}>{elapsedSec}s</Text>
          </View>
        </View>

        {/* Per-swipe countdown bar */}
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${Math.max(0, timePct * 100)}%`, backgroundColor: timerBarColor }]} />
        </View>

        <View style={styles.progressRow}>
          {Array.from({ length: SWIPES }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i < swipeIdx ? colors.accent : i === swipeIdx ? colors.gold : colors.muted,
                },
              ]}
            />
          ))}
        </View>
      </LinearGradient>

      <View style={styles.arena}>
        <Text style={styles.instruction}>
          {phase === 'intro' ? 'Get ready to swipe!' : 'SWIPE OR TAP IN THE ARROW DIRECTION!'}
        </Text>

        <View
          style={[
            styles.arrowCard,
            {
              borderColor:
                lastResult === 'correct'
                  ? colors.accent
                  : lastResult === 'wrong' || lastResult === 'timeout'
                  ? colors.destructive
                  : colors.border,
            },
          ]}
        >
          {currentDir && (
            <Ionicons
              name={ICON_MAP[currentDir]}
              size={80}
              color={
                lastResult === 'correct'
                  ? colors.accent
                  : lastResult === 'wrong' || lastResult === 'timeout'
                  ? colors.destructive
                  : colors.gold
              }
            />
          )}
        </View>

        {/* Direction button controls for touch & web */}
        <View style={styles.controlsGrid}>
          <Pressable style={styles.dirBtn} onPress={() => handleSwipe('up')}>
            <Ionicons name="arrow-up" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.row}>
            <Pressable style={styles.dirBtn} onPress={() => handleSwipe('left')}>
              <Ionicons name="arrow-back" size={24} color={colors.foreground} />
            </Pressable>
            <Pressable style={styles.dirBtn} onPress={() => handleSwipe('down')}>
              <Ionicons name="arrow-down" size={24} color={colors.foreground} />
            </Pressable>
            <Pressable style={styles.dirBtn} onPress={() => handleSwipe('right')}>
              <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
