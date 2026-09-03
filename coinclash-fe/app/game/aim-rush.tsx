import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Circle {
  id: string;
  x: number;
  y: number;
  color: string;
  size: number;
}

const CIRCLE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];
const GAME_DURATION = 30; // 30 seconds!

export default function AimRushScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const finish = useGameFinish(stake);

  const [phase, setPhase] = useState<'countdown' | 'playing' | 'done'>('countdown');
  const [count, setCount] = useState(3);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameArea, setGameArea] = useState({ width: 340, height: 480 });

  // AI score scaled for 30 seconds
  const aiScore = useRef(Math.floor(22 + Math.random() * 10)); // 22-31 target hits for AI
  const scoreRef = useRef(0);
  const startTime = useRef(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

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
            finish(false, 0, 99, 'hits');
          },
        },
      ]
    );
  }, [finish]);

  // Initial 3-2-1 countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      setPhase('playing');
      startTime.current = Date.now();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  // 30 second game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      setPhase('done');
      const finalHits = scoreRef.current;
      const won = finalHits > aiScore.current;
      setTimeout(() => finish(won, finalHits, aiScore.current, 'hits'), 300);
      return;
    }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, finish]);

  // Spawn randomized targets
  useEffect(() => {
    if (phase !== 'playing') return;
    const spawn = () => {
      const size = 50 + Math.random() * 32;
      const padding = 15;
      const x = padding + Math.random() * (gameArea.width - size - padding * 2);
      const y = padding + Math.random() * (gameArea.height - size - padding * 2);
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 6);
      const color = CIRCLE_COLORS[Math.floor(Math.random() * CIRCLE_COLORS.length)];
      const circle: Circle = { id, x, y, color, size };

      setCircles((prev) => [...prev.slice(-9), circle]);

      setTimeout(() => {
        setCircles((prev) => prev.filter((c) => c.id !== id));
      }, 1800);
    };

    spawn();
    const interval = setInterval(spawn, 750); // Fast spawning
    return () => clearInterval(interval);
  }, [phase, gameArea]);

  const popCircle = useCallback(
    (id: string) => {
      if (phase !== 'playing') return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCircles((prev) => prev.filter((c) => c.id !== id));
      scoreRef.current += 1;
      setScore((s) => s + 1);
    },
    [phase]
  );

  const timePct = timeLeft / GAME_DURATION;
  const timerBarColor = timePct > 0.4 ? '#10B981' : timePct > 0.2 ? '#EAB308' : '#EF4444';

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 12 },
    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    timerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    timerText: { fontSize: 14, color: timerBarColor, fontFamily: 'Inter_700Bold' },

    timerTrack: { height: 6, width: '100%', backgroundColor: colors.muted, borderRadius: 3, overflow: 'hidden' },
    timerFill: { height: '100%', borderRadius: 3 },

    scoreChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignSelf: 'center', marginVertical: 12 },
    scoreText: { fontSize: 16, fontWeight: '700' as const, color: colors.primary, fontFamily: 'Inter_700Bold' },

    arena: { flex: 1, marginHorizontal: 20, marginBottom: 20, borderRadius: 24, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', position: 'relative' },
    countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    countdownNum: { fontSize: 96, fontWeight: '800' as const, color: colors.gold, fontFamily: 'Inter_700Bold' },
    circle: { position: 'absolute', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1E1B4B', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={handleQuit}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Aim Rush</Text>
          <View style={styles.timerChip}>
            <Ionicons name="time-outline" size={14} color={timerBarColor} />
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        {/* 30s Countdown Bar */}
        <View style={styles.timerTrack}>
          <View style={[styles.timerFill, { width: `${Math.max(0, timePct * 100)}%`, backgroundColor: timerBarColor }]} />
        </View>
      </LinearGradient>

      <View style={styles.scoreChip}>
        <Text style={styles.scoreText}>🎯 Targets Hit: {score}</Text>
      </View>

      <View
        style={styles.arena}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setGameArea({ width, height });
        }}
      >
        {phase === 'countdown' && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownNum}>{count > 0 ? count : 'GO!'}</Text>
          </View>
        )}

        {circles.map((c) => (
          <Pressable
            key={c.id}
            style={[
              styles.circle,
              {
                left: c.x,
                top: c.y,
                width: c.size,
                height: c.size,
                borderRadius: c.size / 2,
                backgroundColor: c.color,
              },
            ]}
            onPress={() => popCircle(c.id)}
          >
            <Ionicons name="disc" size={c.size * 0.5} color="#fff" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
