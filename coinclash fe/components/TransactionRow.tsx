import { useColors } from '@/hooks/useColors';
import { type Transaction } from '@/context/WalletContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface TransactionRowProps {
  transaction: Transaction;
}

export function TransactionRow({ transaction }: TransactionRowProps) {
  const colors = useColors();

  const isPositive = transaction.type === 'deposit' || transaction.type === 'win';
  const iconMap: Record<Transaction['type'], { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    deposit: { name: 'add-circle', color: colors.accent },
    stake: { name: 'game-controller', color: colors.primary },
    win: { name: 'trophy', color: colors.gold },
    loss: { name: 'close-circle', color: colors.destructive },
    withdrawal: { name: 'arrow-up-circle', color: colors.primary },
  };
  const icon = iconMap[transaction.type];

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'Just now';
  };

  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: icon.color + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: { flex: 1, gap: 2 },
    desc: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: 'Inter_500Medium',
    },
    time: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    amtRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    amount: {
      fontSize: 15,
      fontWeight: '700' as const,
      color: isPositive ? colors.accent : colors.destructive,
      fontFamily: 'Inter_700Bold',
    },
  });

  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name={icon.name} size={18} color={icon.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.desc}>{transaction.description}</Text>
        <Text style={styles.time}>{formatTime(transaction.timestamp)}</Text>
      </View>
      <View style={styles.amtRow}>
        <MaterialCommunityIcons name="circle" size={11} color={isPositive ? colors.accent : colors.destructive} />
        <Text style={styles.amount}>
          {isPositive ? '+' : '-'}{transaction.amount}
        </Text>
      </View>
    </View>
  );
}
