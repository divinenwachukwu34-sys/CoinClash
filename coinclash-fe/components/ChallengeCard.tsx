import { useColors } from '@/hooks/useColors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface ChallengeCardProps {
  stake: number;
  tier: string;
  playersWaiting: number;
  onPress: () => void;
  disabled?: boolean;
}

export function ChallengeCard({ stake, tier, playersWaiting, onPress, disabled }: ChallengeCardProps) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = () => { scale.value = withSpring(0.97); };
  const handlePressOut = () => { scale.value = withSpring(1); };

  const tierColors: Record<string, string> = {
    Rookie: '#64748B',
    Amateur: '#3B82F6',
    Skilled: '#8B5CF6',
    Pro: '#F59E0B',
    Elite: '#EF4444',
  };
  const tierColor = tierColors[tier] ?? colors.primary;

  const styles = StyleSheet.create({
    animated: { borderRadius: colors.radius },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: disabled ? colors.border : tierColor + '40',
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      opacity: disabled ? 0.5 : 1,
    },
    left: { flex: 1, gap: 4 },
    tier: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: tierColor,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    stakeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stakeText: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.gold,
      fontFamily: 'Inter_700Bold',
    },
    stakeLabel: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    waitingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    waitingText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    playBtn: {
      backgroundColor: disabled ? colors.muted : colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    playText: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },
  });

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={styles.card}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.left}>
          <Text style={styles.tier}>{tier}</Text>
          <View style={styles.stakeRow}>
            <MaterialCommunityIcons name="circle" size={14} color={colors.gold} />
            <Text style={styles.stakeText}>{stake}</Text>
            <Text style={styles.stakeLabel}>coins per match</Text>
          </View>
          <View style={styles.waitingRow}>
            <View style={styles.waitingDot} />
            <Text style={styles.waitingText}>{playersWaiting} players waiting</Text>
          </View>
        </View>
        <View style={styles.playBtn}>
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={styles.playText}>Play</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
