import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GAMES = [
  { id: 'play', name: 'Tap Race', description: 'Fastest tap after the signal', icon: 'flash' as const, color: '#F59E0B' },
  { id: 'color-match', name: 'Color Match', description: 'Identify the correct color', icon: 'color-palette' as const, color: '#EC4899' },
  { id: 'math-duel', name: 'Math Duel', description: 'Solve problems faster', icon: 'calculator' as const, color: '#3B82F6' },
  { id: 'memory-flash', name: 'Memory Flash', description: 'Remember the sequence', icon: 'eye' as const, color: '#8B5CF6' },
  { id: 'aim-rush', name: 'Aim Rush', description: 'Pop targets before they vanish', icon: 'radio-button-on' as const, color: '#EF4444' },
  { id: 'swipe-duel', name: 'Swipe Duel', description: 'Swipe the arrow directions', icon: 'swap-horizontal' as const, color: '#10B981' },
  { id: 'number-catch', name: 'Number Catch', description: 'Catch the right number', icon: 'analytics' as const, color: '#F97316' },
  { id: 'word-scramble', name: 'Word Scramble', description: 'Unscramble the letters', icon: 'text' as const, color: '#14B8A6' },
  { id: 'trivia', name: 'Trivia Clash', description: 'Answer questions correctly', icon: 'help-circle' as const, color: '#A78BFA' },
];

function GameCard({
  game,
  onPress,
}: {
  game: (typeof GAMES)[number];
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: pressed ? game.color + '80' : colors.border,
        padding: 16,
        gap: 8,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: game.color + '20',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={game.icon} size={20} color={game.color} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
        {game.name}
      </Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 15 }}>
        {game.description}
      </Text>
    </Pressable>
  );
}

export default function SelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake: string }>();
  const stake = parseInt(params.stake ?? '10', 10);
  const { deductCoins, addTransaction } = useWallet();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleSelect = (gameId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deductCoins(stake);
    addTransaction({ type: 'stake', amount: stake, description: `Entered ${stake}-coin match` });
    router.push({ pathname: `/game/${gameId}` as any, params: { stake: String(stake) } });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
    },
    title: {
      flex: 1, textAlign: 'center',
      fontSize: 18, fontWeight: '700' as const,
      color: colors.foreground, fontFamily: 'Inter_700Bold',
    },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.card, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1, borderColor: colors.gold + '40',
      alignSelf: 'center',
    },
    pillText: { fontSize: 14, fontWeight: '600' as const, color: colors.gold, fontFamily: 'Inter_600SemiBold' },
    scrollContent: { padding: 16, paddingBottom: 60, gap: 10 },
    row: { flexDirection: 'row', gap: 10 },
  });

  const rows: (typeof GAMES)[] = [];
  for (let i = 0; i < GAMES.length; i += 2) {
    rows.push(GAMES.slice(i, i + 2) as any);
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#120A2A', colors.background]} style={styles.header}>
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.title}>Choose a Game</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.pill}>
          <MaterialCommunityIcons name="circle" size={12} color={colors.gold} />
          <Text style={styles.pillText}>Stake: {stake} coins per match</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((game) => (
              <GameCard key={game.id} game={game} onPress={() => handleSelect(game.id)} />
            ))}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
