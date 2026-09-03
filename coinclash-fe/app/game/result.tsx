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
    tournamentId: string;
    playerAcc?: string;
    aiAcc?: string;
    playerTimeMs?: string;
    aiTimeMs?: string;
    tieBreaker?: string;
  }>();

  const tournamentId = params.tournamentId;
  const isTourney = !!tournamentId;
  const stake = parseInt(params.stake ?? '0', 10);
  const isPractice = !isTourney && stake === 0;

  const won = params.won === '1';
  const playerVal = parseInt(params.playerTime ?? '0', 10);
  const opponentVal = parseInt(params.opponentTime ?? '0', 10);
  const prize = parseInt(params.prize ?? '0', 10);
  const unit = params.unit ?? 'ms';
  const netChange = won ? prize - stake : -stake;

  const playerAcc = params.playerAcc || '';
  const aiAcc = params.aiAcc || '';
  const playerTimeMs = params.playerTimeMs ? parseInt(params.playerTimeMs, 10) : (unit === 'ms' ? playerVal : 0);
  const aiTimeMs = params.aiTimeMs ? parseInt(params.aiTimeMs, 10) : (unit === 'ms' ? opponentVal : 0);
  const tieBreaker = params.tieBreaker || '';

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
  const bgColors: [string, string] = isTourney 
    ? (won ? ['#3B0764', colors.background] : ['#4C1D95', colors.background])
    : (won ? ['#052E16', colors.background] : ['#1C0A0A', colors.background]);

  // Format values
  const formatVal = (v: number) => {
    if (unit === 'ms') return `${(v / 1000).toFixed(2)}s`;
    if (unit === 'err') return `${v} err`;
    if (unit === 'pts') return `${v} pts`;
    if (unit === 'hits') return `${v} hits`;
    return String(v);
  };

  const formatTime = (ms: number) => {
    if (ms === 0 || ms >= 99999) return '—';
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSubtitle = () => {
    if (playerVal === 99999 || playerVal === 999) {
      return '⚠️ Match Forfeited — Early exit resulted in automatic loss';
    }
    if (tieBreaker === 'accuracy') {
      return won
        ? `🎯 Won by Higher Accuracy! (${playerAcc} vs ${aiAcc})`
        : `❌ Opponent had Higher Accuracy (${aiAcc} vs ${playerAcc})`;
    }
    if (tieBreaker === 'time' || (playerTimeMs > 0 && aiTimeMs > 0 && playerTimeMs < 99999)) {
      const diffSec = (Math.abs(aiTimeMs - playerTimeMs) / 1000).toFixed(2);
      if (won) {
        return `⚡ Accuracy Tied! Won by faster Time (${diffSec}s faster)`;
      } else {
        return `⌛ Accuracy Tied! Opponent was ${diffSec}s faster`;
      }
    }
    if (unit === 'ms') {
      if (!won && playerVal === 0) return 'You tapped too early';
      const diffSec = (Math.abs(opponentVal - playerVal) / 1000).toFixed(2);
      return won ? `⚡ Fast finish! You were ${diffSec}s faster!` : `⌛ Opponent was ${diffSec}s faster!`;
    }
    if (unit === 'err') {
      return won ? `🎯 More Accurate! (${playerVal} err vs ${opponentVal} err)` : `❌ Opponent was more accurate`;
    }
    const diff = Math.abs(playerVal - opponentVal);
    return won ? `You scored ${diff} more point${diff !== 1 ? 's' : ''}` : `Opponent scored ${diff} more point${diff !== 1 ? 's' : ''}`;
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { flex: 1, paddingTop: topPad + 16 },
    hero: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 20, paddingBottom: 16, gap: 10 },
    iconCircle: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
    resultTitle: { fontSize: 34, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', textAlign: 'center' },
    resultSub: { fontSize: 15, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 22 },
    netChange: { fontSize: 22, fontWeight: '700' as const, fontFamily: 'Inter_700Bold', marginTop: 2 },
    stats: { margin: 16, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
    
    badgeRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 4 },
    badgeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    badgeText: { fontSize: 11, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },

    timingRow: { flexDirection: 'row', gap: 10 },
    timingCard: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border },
    timingHeader: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
    timingLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    timingValue: { fontSize: 18, fontWeight: '700' as const, fontFamily: 'Inter_700Bold' },

    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statLabel: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    statVal: { fontSize: 14, fontWeight: '600' as const, color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    divider: { height: 1, backgroundColor: colors.border },
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
            <Ionicons name={won ? 'trophy' : 'close-circle'} size={48} color={won ? colors.accent : colors.destructive} />
          </View>
          <Text style={[styles.resultTitle, { color: won ? colors.accent : colors.destructive }]}>
            {won ? 'You Won!' : 'You Lost'}
          </Text>
          <Text style={styles.resultSub}>{getSubtitle()}</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isTourney ? (
              <Text style={[styles.netChange, { color: won ? colors.accent : colors.destructive }]}>
                {won ? '+1 Tournament Score' : '-1 Tournament Life'}
              </Text>
            ) : isPractice ? (
              <Text style={[styles.netChange, { color: colors.mutedForeground }]}>
                Practice Match
              </Text>
            ) : (
              <>
                <MaterialCommunityIcons name="circle" size={16} color={won ? colors.accent : colors.destructive} />
                <Text style={[styles.netChange, { color: won ? colors.accent : colors.destructive }]}>
                  {netChange > 0 ? '+' : ''}{netChange} coins
                </Text>
              </>
            )}
          </View>
        </Animated.View>

        <Animated.View style={[styles.stats, statsAnimStyle]}>
          {/* Priority Grading Badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badgeChip, { borderColor: colors.gold + '50', backgroundColor: colors.gold + '15' }]}>
              <Ionicons name="ribbon" size={12} color={colors.gold} />
              <Text style={[styles.badgeText, { color: colors.gold }]}>1st Priority: Accuracy</Text>
            </View>
            <View style={[styles.badgeChip, { borderColor: colors.primary + '50', backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="stopwatch" size={12} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>2nd Priority: Time</Text>
            </View>
          </View>

          {/* 1st Priority: Accuracy Comparison */}
          {playerAcc && aiAcc ? (
            <View style={styles.timingRow}>
              <View style={styles.timingCard}>
                <Text style={styles.timingHeader}>Your Accuracy</Text>
                <Text style={[styles.timingValue, { color: won ? colors.accent : colors.destructive }]}>
                  {playerAcc}
                </Text>
              </View>
              <View style={styles.timingCard}>
                <Text style={styles.timingHeader}>Opponent Acc.</Text>
                <Text style={[styles.timingValue, { color: won ? colors.destructive : colors.accent }]}>
                  {aiAcc}
                </Text>
              </View>
            </View>
          ) : null}

          {/* 2nd Priority: Timing / Speed Comparison */}
          <View style={styles.timingRow}>
            <View style={styles.timingCard}>
              <Text style={styles.timingHeader}>Your Time</Text>
              <Text style={[styles.timingValue, { color: won ? colors.accent : colors.destructive }]}>
                {playerTimeMs > 0 ? formatTime(playerTimeMs) : (playerVal === 0 && unit === 'ms' ? '—' : formatVal(playerVal))}
              </Text>
            </View>
            <View style={styles.timingCard}>
              <Text style={styles.timingHeader}>Opponent Time</Text>
              <Text style={[styles.timingValue, { color: won ? colors.destructive : colors.accent }]}>
                {aiTimeMs > 0 ? formatTime(aiTimeMs) : formatVal(opponentVal)}
              </Text>
            </View>
          </View>

          {!isTourney && !isPractice && (
            <>
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
            </>
          )}
        </Animated.View>

        <View style={styles.buttons}>
          <View style={styles.primaryBtn}>
            <Pressable onPress={() => router.replace(isTourney ? `/tournament/${tournamentId}` : '/(tabs)/lobby')}>
              <LinearGradient colors={isTourney ? ['#9333EA', '#4F1ADE'] : [colors.primary, '#4F1ADE']} style={styles.primaryBtnInner}>
                <Ionicons name={isTourney ? 'flag' : 'game-controller'} size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{isTourney ? 'Return to Tournament' : 'Play Again'}</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)/lobby')}>
            <Text style={styles.secondaryBtnText}>Back to Lobby</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
