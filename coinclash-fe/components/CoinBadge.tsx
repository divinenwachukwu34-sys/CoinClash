import { useColors } from '@/hooks/useColors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

interface CoinBadgeProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
}

export function CoinBadge({ amount, size = 'md' }: CoinBadgeProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const prevAmount = React.useRef(amount);

  useEffect(() => {
    if (prevAmount.current !== amount) {
      scale.value = withSequence(withSpring(1.2), withSpring(1));
      prevAmount.current = amount;
    }
  }, [amount, scale]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const textSizes = { sm: 13, md: 16, lg: 28 };
  const iconSizes = { sm: 12, md: 15, lg: 24 };

  const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    amount: {
      fontSize: textSizes[size],
      fontWeight: '700' as const,
      color: colors.gold,
      fontFamily: 'Inter_700Bold',
    },
  });

  return (
    <Animated.View style={[styles.row, animStyle]}>
      <MaterialCommunityIcons name="circle" size={iconSizes[size]} color={colors.gold} />
      <Text style={styles.amount}>{amount.toLocaleString()}</Text>
    </Animated.View>
  );
}
