import { useColors } from '@/hooks/useColors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    won: string;
    playerTime: string;
    opponentTime: string;
    prize: string;
    stake: string;
    unit: string;
  }>();

  const won = params.won === '1';
  const playerVal = parseInt(params.playerTime ?? '0', 10);
  const opponentVal = parseInt(params.opponentTime ?? '0', 10);
  const prize = parseInt(params.prize ?? '0', 10);
  const stake = parseInt(params.stake ?? '10', 10);
  const unit = params.unit ?? 'ms';
  const netChange = won ? prize - stake : -stake;

  const containerScale = useSharedValue(0.8);
  const containerOpacity = useSharedValue(0);
  const statsTranslate = useSharedValue(30);
  const statsOpacity = useSharedValue(0);

  useEffect(() => {
    containerScale.value = withSpring(1, { damping: 12 });
    containerOpacity.value = withTiming(1, { duration: 300 });
    statsTranslate.value = withDelay(350, withSpring(0, { damping: 14 }));
    statsOpacity.value = withDelay(350, withTiming(1, { duration: 400 }));
    if (won) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [won, containerScale, containerOpacity, statsTranslate, statsOpacity]);

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: containerScale.value }],
    opacity: containerOpacity.value,
  }));
  const statsAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: statsTranslate.value }],
    opacity: statsOpacity.value,
  }));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const bgColors: [string, string] = won ? ['#052E16', colors.background] : ['#1C0A0A', colors.background];

  // Flexible display based on unit
  const formatVal = (v: number) => {
    if (unit === 'ms') return `${v}ms`;
    if (unit === 'err') return `${v} err`;
    if (unit === 'pts') return `${v} pts`;
    if (unit === 'hits') return `${v} hits`;
    return String(v);
  };

  const valueLabel = unit === 'ms' ? 'time' : unit === 'err' ? 'error' : 'score';

  const getSubtitle = () => {
    if (unit === 'ms') {
      if (!won && playerVal === 0) return 'You tapped too early';
      return won
        ? `You were ${opponentVal - playerVal}ms faster`
        : `You were ${playerVal - opponentVal}ms too slow`;
    }
    if (unit === 'err') {
      return won ? 'You were more accurate!' : 'Your opponent was more accurate';
    }
    const diff = Math.abs(playerVal - opponentVal);
    return won
      ? `You scored ${diff} more point${diff !== 1 ? 's' : ''}`
      : `Opponent scored ${diff} more point${diff !== 1 ? 's' : ''}`;
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { flex: 1, paddingTop: topPad + 16 },
    hero: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 30, paddingBottom: 20, gap: 12 },
    iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
    resultTitle: { fontSize: 36, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center' },
    resultSub: { fontSize: 16, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' },
    netChange: { fontSize: 28, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
    stats: { margin: 20, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 16 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statLabel: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    statVal: { fontSize: 14, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    divider: { height: 1, backgroundColor: colors.border },
    timingRow: { flexDirection: 'row', gap: 12 },
    timingCard: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
    timingLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    timingValue: { fontSize: 20, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },
    buttons: { paddingHorizontal: 20, paddingBottom: bottomPad + 20, gap: 12, marginTop: 'auto' as any },
    primaryBtn: { borderRadius: colors.radius, overflow: 'hidden' },
    primaryBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
    primaryBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
    secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
    secondaryBtnText: { fontSize: 15, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={bgColors} style={styles.gradient}>
        <Animated.View style={[styles.hero, heroAnimStyle]}>
          <View style={[styles.iconCircle, { backgroundColor: (won ? colors.accent : colors.destructive) + '20' }]}>
            <Ionicons name={won ? 'trophy' : 'close-circle'} size={52} color={won ? colors.accent : colors.destructive} />
          </View>
          <Text style={[styles.resultTitle, { color: won ? colors.accent : colors.destructive }]}>
            {won ? 'You Won!' : 'You Lost'}
          </Text>
          <Text style={styles.resultSub}>{getSubtitle()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="circle" size={16} color={won ? colors.accent : colors.destructive} />
            <Text style={[styles.netChange, { color: won ? colors.accent : colors.destructive }]}>
              {netChange > 0 ? '+' : ''}{netChange} coins
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.stats, statsAnimStyle]}>
          <View style={styles.timingRow}>
            <View style={styles.timingCard}>
              <Text style={styles.timingLabel}>Your {valueLabel}</Text>
              <Text style={[styles.timingValue, { color: won ? colors.accent : colors.destructive }]}>
                {playerVal === 0 && unit === 'ms' ? '—' : formatVal(playerVal)}
              </Text>
            </View>
            <View style={styles.timingCard}>
              <Text style={styles.timingLabel}>Opponent</Text>
              <Text style={[styles.timingValue, { color: won ? colors.destructive : colors.accent }]}>
                {formatVal(opponentVal)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Stake</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialCommunityIcons name="circle" size={11} color={colors.gold} />
              <Text style={styles.statVal}>{stake} coins</Text>
            </View>
          </View>

          {won && (
            <>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Prize pool</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialCommunityIcons name="circle" size={11} color={colors.gold} />
                  <Text style={styles.statVal}>{stake * 2} coins</Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>App fee</Text>
                <Text style={[styles.statVal, { color: colors.mutedForeground }]}>–5 coins</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: colors.accent }]}>You receive</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialCommunityIcons name="circle" size={11} color={colors.accent} />
                  <Text style={[styles.statVal, { color: colors.accent }]}>{prize} coins</Text>
                </View>
              </View>
            </>
          )}
        </Animated.View>

        <View style={styles.buttons}>
          <View style={styles.primaryBtn}>
            <Pressable onPress={() => router.replace('/(tabs)/lobby')}>
              <LinearGradient colors={[colors.primary, '#4F1ADE']} style={styles.primaryBtnInner}>
                <Ionicons name="game-controller" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Play Again</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="home-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.secondaryBtnText}>Go Home</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
