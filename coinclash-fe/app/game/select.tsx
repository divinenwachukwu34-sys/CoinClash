import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GAME_IMAGES: Record<string, any> = {
  'play': require('@/assets/images/games/play.jpg'),
  'color-match': require('@/assets/images/games/color-match.jpg'),
  'math-duel': require('@/assets/images/games/math-duel.jpg'),
  'memory-flash': require('@/assets/images/games/memory-flash.jpg'),
  'aim-rush': require('@/assets/images/games/aim-rush.jpg'),
  'swipe-duel': require('@/assets/images/games/swipe-duel.jpg'),
  'number-catch': require('@/assets/images/games/number-catch.jpg'),
  'word-scramble': require('@/assets/images/games/word-scramble.jpg'),
  'trivia': require('@/assets/images/games/trivia.jpg'),
};

const GAMES = [
  { id: 'color-match', name: 'Color Match', description: 'Identify the correct color in fast rounds', icon: 'color-palette' as const, color: '#EC4899' },
  { id: 'math-duel', name: 'Math Duel', description: 'Solve arithmetic problems faster than opponent', icon: 'calculator' as const, color: '#3B82F6' },
  { id: 'aim-rush', name: 'Aim Rush', description: 'Pop targets before they vanish', icon: 'radio-button-on' as const, color: '#EF4444' },
  { id: 'swipe-duel', name: 'Swipe Duel', description: 'Swipe arrow directions over 15 fast rounds', icon: 'swap-horizontal' as const, color: '#10B981' },
  { id: 'memory-flash', name: 'Memory Flash', description: 'Memorize and tap sequence order', icon: 'eye' as const, color: '#8B5CF6' },
  { id: 'word-scramble', name: 'Word Scramble', description: 'Unscramble letters to find the word', icon: 'text' as const, color: '#14B8A6' },
  { id: 'trivia', name: 'Trivia Clash', description: 'Answer general knowledge questions', icon: 'help-circle' as const, color: '#A78BFA' },
  { id: 'number-catch', name: 'Number Catch', description: 'Catch the exact target number', icon: 'analytics' as const, color: '#F97316' },
  { id: 'play', name: 'Tap Race', description: 'Fastest tap reaction after the signal', icon: 'flash' as const, color: '#F59E0B' },
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
        borderRadius: 18,
        borderWidth: 1,
        borderColor: pressed ? game.color : colors.border,
        padding: 16,
        gap: 12,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        shadowColor: game.color,
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 4,
      })}
    >
      <View
        style={{
          width: '100%',
          height: 90,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: game.color + '20',
          borderWidth: 1.5,
          borderColor: game.color + '40',
          alignItems: 'center',
          justify: 'center',
        }}
      >
        <Image
          source={GAME_IMAGES[game.id]}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
          {game.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 16 }}>
          {game.description}
        </Text>
      </View>
    </Pressable>
  );
}

export default function SelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ stake?: string; tournamentId?: string }>();
  const stake = parseInt(params.stake ?? '0', 10);
  const tournamentId = params.tournamentId;
  const { deductCoins, addTransaction } = useWallet();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleSelect = (gameId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (stake > 0 && !tournamentId) {
      deductCoins(stake);
      addTransaction({ type: 'stake', amount: stake, description: `Entered ${stake}-coin match` });
    }
    router.push({ pathname: `/game/${gameId}` as any, params: { stake: String(stake), tournamentId } });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 20,
      gap: 4,
    },
    topRow: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subTitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 4 },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 16,
      gap: 14,
    },
    col: {
      width: '47%',
    },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1E1B4B', colors.background]} style={styles.header}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={18} color={colors.mutedForeground} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {tournamentId ? 'Tournament Match' : stake > 0 ? `${stake}-Coin Match` : 'Practice Arena'}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <Text style={styles.subTitle}>Select a game mode to compete in</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {GAMES.map((g) => (
            <View key={g.id} style={styles.col}>
              <GameCard game={g} onPress={() => handleSelect(g.id)} />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
