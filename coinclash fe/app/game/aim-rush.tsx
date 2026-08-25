import { useGameFinish } from '@/hooks/useGameFinish';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Circle {
  id: string;
  x: number;
  y: number;
  color: string;
  size: number;
}

const CIRCLE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
const GAME_DURATION = 10;

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
  const [gameArea, setGameArea] = useState({ width: 350, height: 500 });
  const aiScore = useRef(Math.floor(7 + Math.random() * 5)); // 7-11
  const scoreRef = useRef(0);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) { setPhase('playing'); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      setPhase('done');
      const won = scoreRef.current > aiScore.current;
      setTimeout(() => finish(won, scoreRef.current, aiScore.current, 'hits'), 300);
      return;
    }
    const t = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, finish]);

  // Spawn circles
  useEffect(() => {
    if (phase !== 'playing') return;
    const spawn = () => {
      const size = 55 + Math.random() * 30;
      const padding = 20;
      const x = padding + Math.random() * (gameArea.width - size - padding * 2);
      const y = padding + Math.random() * (gameArea.height - size - padding * 2);
      const id = Date.now().toString() + Math.random().toString(36).substr(2, 6);
      const color = CIRCLE_COLORS[Math.floor(Math.random() * CIRCLE_COLORS.length)];
      const circle: Circle = { id, x, y, color, size };

      setCircles((prev) => [...prev.slice(-8), circle]);

      setTimeout(() => {
        setCircles((prev) => prev.filter((c) => c.id !== id));
      }, 2500);
    };

    spawn();
    const interval = setInterval(spawn, 1100);
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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 12 },
    topBar: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 20 },
    stat: { alignItems: 'center' },
    statVal: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', color: colors.foreground },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    gameArea: { flex: 1, position: 'relative' as const },
    countdownOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: colors.background + 'E0',
    },
    countNum: { fontSize: 80, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    countLabel: { fontSize: 18, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
    circle: { position: 'absolute' as const },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1A0A0A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.accent }]}>{score}</Text>
              <Text style={styles.statLabel}>HITS</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: timeLeft <= 3 ? colors.destructive : colors.foreground }]}>
                {timeLeft}s
              </Text>
              <Text style={styles.statLabel}>LEFT</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.mutedForeground }]}>?</Text>
              <Text style={styles.statLabel}>AI</Text>
            </View>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <View
        style={styles.gameArea}
        onLayout={(e) =>
          setGameArea({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }
      >
        {circles.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.circle, { left: c.x, top: c.y, width: c.size, height: c.size }]}
            onPress={() => popCircle(c.id)}
          >
            <View
              style={{
                width: c.size,
                height: c.size,
                borderRadius: c.size / 2,
                backgroundColor: c.color,
                shadowColor: c.color,
                shadowOpacity: 0.6,
                shadowRadius: 8,
                elevation: 4,
              }}
            />
          </Pressable>
        ))}

        {phase === 'countdown' && (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countLabel}>Aim Rush — Tap circles!</Text>
            <Text style={styles.countNum}>{count > 0 ? count : 'GO!'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
