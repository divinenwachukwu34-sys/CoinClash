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
  { id: 'archery', name: 'Archery 3D', description: 'Aim with wind drift and hit bullseyes in 3D', icon: 'locate' as const, color: '#10B981' },
  { id: 'basketball', name: 'Basketball 3D', description: 'Swipe to shoot 3-pointers and swishes in 3D', icon: 'basketball' as const, color: '#F97316' },
  { id: 'penalty', name: 'Penalty Shootout 3D', description: 'Five-kick showdown as kicker & goalkeeper in 3D', icon: 'football' as const, color: '#3B82F6' },
  { id: 'sumo', name: 'Sumo Clash 3D', description: 'Tap fast to push opponent out of the 3D ring', icon: 'barbell' as const, color: '#EF4444' },
  { id: 'ring-rush', name: 'Ring Rush 3D', description: 'Strategic 3D ring stacking puzzle race', icon: 'disc' as const, color: '#8B5CF6' },
  { id: 'number-catch', name: 'Number Catch', description: 'Catch target numbers before time expires', icon: 'finger-print' as const, color: '#F97316' },
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
          backgroundColor: game.color + '25',
          borderWidth: 1.5,
          borderColor: game.color + '50',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {GAME_IMAGES[game.id] ? (
          <Image
            source={GAME_IMAGES[game.id]}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name={game.icon} size={38} color={game.color} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: game.color, letterSpacing: 1 }}>3D ARCADE</Text>
          </View>
        )}
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
