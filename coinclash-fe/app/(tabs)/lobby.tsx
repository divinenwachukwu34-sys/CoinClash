import { ChallengeCard } from '@/components/ChallengeCard';
import { useWallet } from '@/context/WalletContext';
import { useColors } from '@/hooks/useColors';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TIERS = [
  { stake: 0, tier: 'Practice', waiting: Math.floor(Math.random() * 10) + 5 },
  { stake: 10, tier: 'Rookie', waiting: Math.floor(Math.random() * 8) + 3 },
  { stake: 25, tier: 'Amateur', waiting: Math.floor(Math.random() * 6) + 2 },
  { stake: 50, tier: 'Skilled', waiting: Math.floor(Math.random() * 5) + 2 },
  { stake: 100, tier: 'Pro', waiting: Math.floor(Math.random() * 4) + 1 },
  { stake: 250, tier: 'Elite', waiting: Math.floor(Math.random() * 3) + 1 },
];

export default function LobbyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coins } = useWallet();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handlePlay = (stake: number) => {
    if (coins < stake) {
      Alert.alert(
        'Not enough coins',
        `You need ${stake} coins to enter this match. Deposit more in your wallet.`,
        [{ text: 'OK' }]
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to game selection — coins are deducted when a game is chosen
    router.push({ pathname: '/game/select', params: { stake: String(stake) } });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
    },
    subtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      marginTop: 4,
    },
    balancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.gold + '40',
      alignSelf: 'flex-start',
      marginTop: 12,
    },
    balanceText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.gold,
      fontFamily: 'Inter_600SemiBold',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 100,
      gap: 12,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },
    howRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 4,
    },
    howCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      alignItems: 'center',
      gap: 4,
    },
    howNum: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    howText: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
    gamesNote: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      paddingVertical: 4,
    },
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0D0A1F', colors.background]} style={styles.header}>
        <Text style={styles.title}>Game Lobby</Text>
        <Text style={styles.subtitle}>Pick a stake, choose a game, beat your opponent</Text>
        <View style={styles.balancePill}>
          <Text style={styles.balanceText}>Balance: {coins} coins</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>How it works</Text>
        <View style={styles.howRow}>
          <View style={styles.howCard}>
            <Text style={styles.howNum}>1</Text>
            <Text style={styles.howText}>Pick a stake</Text>
          </View>
          <View style={styles.howCard}>
            <Text style={styles.howNum}>2</Text>
            <Text style={styles.howText}>Choose a game</Text>
          </View>
          <View style={styles.howCard}>
            <Text style={styles.howNum}>3</Text>
            <Text style={styles.howText}>Winner takes pot</Text>
          </View>
        </View>
        <Text style={styles.gamesNote}>9 games available — Tap Race, Color Match, Math Duel, Memory Flash & more</Text>

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Choose your stake</Text>
        {TIERS.map((t) => (
          <ChallengeCard
            key={t.stake}
            stake={t.stake}
            tier={t.tier}
            playersWaiting={t.waiting}
            disabled={coins < t.stake}
            onPress={() => handlePlay(t.stake)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
