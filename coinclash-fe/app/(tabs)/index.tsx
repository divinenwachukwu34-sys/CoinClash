import { CoinBadge } from '@/components/CoinBadge';
import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { useNotifications } from '@/context/NotificationContext';
import { NotificationModal } from '@/components/NotificationModal';
import { api, type BonusStatus, type LeaderboardEntry } from '@/lib/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

const POPULAR_GAMES = [
  { id: 'play', name: 'Tap Race', tag: 'Reaction Speed', color: '#F59E0B' },
  { id: 'aim-rush', name: 'Aim Rush', tag: 'Precision Target', color: '#EF4444' },
  { id: 'color-match', name: 'Color Match', tag: 'Visual Reflex', color: '#EC4899' },
  { id: 'math-duel', name: 'Math Duel', tag: 'Mental Calculation', color: '#3B82F6' },
  { id: 'swipe-duel', name: 'Swipe Duel', tag: 'Directional Speed', color: '#10B981' },
  { id: 'memory-flash', name: 'Memory Flash', tag: 'Pattern Sequence', color: '#8B5CF6' },
  { id: 'word-scramble', name: 'Word Scramble', tag: 'Anagram Puzzle', color: '#14B8A6' },
  { id: 'trivia', name: 'Trivia Clash', tag: 'Knowledge Battle', color: '#A78BFA' },
  { id: 'number-catch', name: 'Number Catch', tag: 'Focus Target', color: '#F97316' },
];

const STREAK_COINS = [0, 15, 20, 25, 30, 35, 40, 50];

function getLevelInfo(totalGames: number) {
  if (totalGames >= 100) return { label: 'Legend', color: '#F59E0B', icon: '👑' };
  if (totalGames >= 50)  return { label: 'Elite',  color: '#8B5CF6', icon: '💎' };
  if (totalGames >= 20)  return { label: 'Pro',    color: '#3B82F6', icon: '🏆' };
  if (totalGames >= 5)   return { label: 'Skilled',color: '#10B981', icon: '⚡' };
  return { label: 'Rookie', color: '#6B7280', icon: '🎮' };
}

function formatRelTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

function getGameTitle(type: string): string {
  const match = POPULAR_GAMES.find((g) => g.id === type);
  return match ? match.name : 'Coin Match';
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coins, syncFromServer, addTransaction } = useWallet();
  const { stats, gameHistory } = useGame();
  const { user, token } = useAuth();
  const { unreadCount } = useNotifications();
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const [bonus, setBonus] = useState<BonusStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);

  // Pulse animation for claim button
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!bonus?.canClaim) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bonus?.canClaim, pulse]);

  const loadBonus = useCallback(async () => {
    if (!token) return;
    try { setBonus(await api.getBonusStatus(token)); } catch {}
  }, [token]);

  const loadLeaderboard = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getLeaderboard('weekly', token);
      setTopPlayers(data.board.slice(0, 3));
    } catch {}
  }, [token]);

  useEffect(() => {
    loadBonus();
    loadLeaderboard();
  }, [loadBonus, loadLeaderboard]);

  const handleClaimBonus = async () => {
    if (!token || !bonus?.canClaim) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setClaiming(true);
    try {
      const result = await api.claimBonus(token);
      syncFromServer(result.newBalance);
      addTransaction({
        type: 'deposit',
        amount: result.coinsAwarded,
        description: `Day ${result.newStreak} daily bonus`,
      });
      setBonus((prev) => prev ? { ...prev, canClaim: false, streak: result.newStreak, hoursUntilNext: 24 } : prev);
    } catch {}
    setClaiming(false);
  };

  const totalGames = stats.wins + stats.losses;
  const level = getLevelInfo(totalGames);
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      {/* ── 1. COMPACT TOP HEADER & BALANCE BAR ────────────────────────── */}
      <LinearGradient colors={['#160832', '#090514']} style={s.topHeader}>
        <View style={s.headerRow}>
          {/* Left Player Info */}
          <Pressable style={s.playerInfo} onPress={() => router.push('/(tabs)/profile')}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={s.playerDetails}>
              <Text style={s.greeting}>Welcome back 👋</Text>
              <View style={s.nameRow}>
                <Text style={s.username} numberOfLines={1}>{user?.username ?? 'Player'}</Text>
                <View style={s.tierPill}>
                  <Text style={s.tierText}>{level.icon} {level.label}</Text>
                </View>
                {bonus && bonus.streak > 0 && (
                  <View style={s.streakPill}>
                    <Text style={s.streakText}>🔥 {bonus.streak}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>

          {/* Right Actions */}
          <View style={s.topActions}>
            <Pressable style={s.iconBtn} onPress={() => setNotifModalVisible(true)}>
              <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
              {unreadCount > 0 && (
                <View style={s.badgeDot}>
                  <Text style={s.badgeDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable style={s.iconBtn} onPress={() => router.push('/(tabs)/profile')}>
              <Ionicons name="person-outline" size={19} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        {/* ── 2. COMPACT WALLET / BALANCE STRIP ─────────────────────── */}
        <View style={s.balanceStrip}>
          <View style={s.balanceLeft}>
            <Text style={s.balanceLabel}>Your Balance</Text>
            <View style={s.balanceAmountRow}>
              <CoinBadge amount={coins} size="md" />
            </View>
          </View>

          <Pressable style={s.depositBtn} onPress={() => router.push('/(tabs)/wallet')}>
            <Ionicons name="add-circle" size={16} color="#FFFFFF" />
            <Text style={s.depositBtnText}>+ Deposit</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <NotificationModal visible={notifModalVisible} onClose={() => setNotifModalVisible(false)} />

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 3. FEATURED CLASH — HERO SECTION (MAIN VISUAL ANCHOR) ───── */}
        <View style={s.heroSection}>
          <Pressable style={s.heroCard} onPress={() => router.push('/game/play?stake=10')}>
            <Image
              source={GAME_IMAGES['play']}
              style={s.heroBgImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(9,5,20,0.3)', 'rgba(9,5,20,0.85)', '#0D0826']}
              style={s.heroGradientOverlay}
            />

            <View style={s.heroContent}>
              <View style={s.featuredBadgeRow}>
                <View style={s.featuredTag}>
                  <Text style={s.featuredTagText}>🔥 FEATURED CLASH</Text>
                </View>
                <View style={s.modeBadge}>
                  <Text style={s.modeBadgeText}>1v1 • 15 SEC</Text>
                </View>
              </View>

              <Text style={s.heroTitle}>⚡ TAP RACE</Text>
              <Text style={s.heroSub}>How fast are your reactions? Pure speed duel.</Text>

              <View style={s.heroFooter}>
                <View style={s.prizeTag}>
                  <Text style={s.prizeTagLabel}>Win up to</Text>
                  <View style={s.prizeValRow}>
                    <MaterialCommunityIcons name="circle" size={12} color={colors.gold} />
                    <Text style={s.prizeValText}>180 Coins</Text>
                  </View>
                </View>

                <Pressable
                  style={s.heroCtaBtn}
                  onPress={() => router.push('/game/play?stake=10')}
                >
                  <LinearGradient
                    colors={[colors.primary, '#4F1ADE']}
                    style={s.heroCtaInner}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <Text style={s.heroCtaText}>PLAY NOW</Text>
                    <Ionicons name="flash" size={16} color="#FFF" />
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </View>

        {/* ── 4. POPULAR GAMES (HORIZONTAL CAROUSEL) ────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Text style={s.sectionEmoji}>🎮</Text>
              <Text style={s.sectionTitle}>Popular Games</Text>
            </View>
            <Pressable onPress={() => router.push('/game/select')}>
              <Text style={s.seeAllText}>See all →</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.horizontalCarousel}
          >
            {POPULAR_GAMES.map((game) => (
              <Pressable
                key={game.id}
                style={s.gameCard}
                onPress={() => router.push({ pathname: `/game/${game.id}` as any, params: { stake: '10' } })}
              >
                <View style={s.gameCardImageWrapper}>
                  <Image
                    source={GAME_IMAGES[game.id]}
                    style={s.gameCardImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(11, 7, 26, 0.95)']}
                    style={s.gameCardImageOverlay}
                  />
                  <View style={[s.gameTagBadge, { backgroundColor: game.color + '30', borderColor: game.color + '60' }]}>
                    <Text style={[s.gameTagText, { color: game.color }]}>{game.tag}</Text>
                  </View>
                </View>

                <View style={s.gameCardDetails}>
                  <Text style={s.gameCardName} numberOfLines={1}>{game.name}</Text>
                  <View style={s.gameCardPlayBtn}>
                    <Text style={s.gameCardPlayText}>Play</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ── 5. QUICK CLASH ───────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Text style={s.sectionEmoji}>⚔️</Text>
            <Text style={s.sectionTitle}>Quick Clash</Text>
          </View>

          <View style={s.quickClashRow}>
            {/* Primary Matchmaking Card */}
            <Pressable
              style={[s.quickCard, s.quickCardPrimary]}
              onPress={() => router.push('/(tabs)/lobby')}
            >
              <LinearGradient
                colors={['#7C3AED', '#4F1ADE']}
                style={s.quickCardGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <View style={s.quickIconCircle}>
                  <Ionicons name="game-controller" size={24} color="#FFF" />
                </View>
                <Text style={s.quickCardTitle}>Find a Match</Text>
                <Text style={s.quickCardSub}>Get matched with an online opponent</Text>
                <View style={s.quickCtaPill}>
                  <Text style={s.quickCtaText}>Match Now →</Text>
                </View>
              </LinearGradient>
            </Pressable>

            {/* Secondary Challenge Card */}
            <Pressable
              style={[s.quickCard, s.quickCardSecondary]}
              onPress={() => router.push('/game/select')}
            >
              <View style={s.quickCardInner}>
                <View style={[s.quickIconCircle, { backgroundColor: colors.accent + '20' }]}>
                  <Ionicons name="people" size={24} color={colors.accent} />
                </View>
                <Text style={s.quickCardTitleSecondary}>Challenge Friend</Text>
                <Text style={s.quickCardSubSecondary}>Play directly against someone</Text>
                <View style={[s.quickCtaPill, { backgroundColor: colors.accent + '20' }]}>
                  <Text style={[s.quickCtaText, { color: colors.accent }]}>Invite →</Text>
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── 6. LIVE TOURNAMENT ───────────────────────────────────────── */}
        <View style={s.section}>
          <Pressable style={s.tourneyCard} onPress={() => router.push('/(tabs)/tournament')}>
            <LinearGradient
              colors={['#2E1065', '#1E1B4B', '#0F172A']}
              style={s.tourneyGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={s.tourneyHeaderRow}>
                <View style={s.tourneyBadge}>
                  <Ionicons name="trophy" size={14} color={colors.gold} />
                  <Text style={s.tourneyBadgeText}>DAILY RUSH TOURNAMENT</Text>
                </View>
                <View style={s.timerChip}>
                  <Ionicons name="time-outline" size={13} color="#F59E0B" />
                  <Text style={s.timerChipText}>01:42:18 remaining</Text>
                </View>
              </View>

              <View style={s.tourneyStatsGrid}>
                <View style={s.tourneyStatItem}>
                  <Text style={s.tourneyStatLabel}>Prize Pool</Text>
                  <View style={s.tourneyCoinRow}>
                    <MaterialCommunityIcons name="circle" size={12} color={colors.gold} />
                    <Text style={s.tourneyStatVal}>2,000 🪙</Text>
                  </View>
                </View>
                <View style={s.tourneyStatItem}>
                  <Text style={s.tourneyStatLabel}>Entry Fee</Text>
                  <Text style={s.tourneyStatVal}>50 🪙</Text>
                </View>
                <View style={s.tourneyStatItem}>
                  <Text style={s.tourneyStatLabel}>Players</Text>
                  <Text style={s.tourneyStatVal}>32 / 64</Text>
                </View>
              </View>

              <View style={s.tourneyFooter}>
                <Pressable
                  style={s.tourneyBtn}
                  onPress={() => router.push('/(tabs)/tournament')}
                >
                  <Text style={s.tourneyBtnText}>JOIN NOW</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        {/* ── DAILY BONUS PROMO ────────────────────────────────────────── */}
        {bonus && (
          <View style={s.bonusCard}>
            <LinearGradient
              colors={bonus.canClaim ? ['#4F1ADE', '#7C3AED'] : ['#1E1E2E', '#1E1E2E']}
              style={s.bonusGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={s.streakDots}>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <View key={day} style={[s.dot, bonus.streak >= day && s.dotActive]}>
                    <Text style={s.dotText}>{day === 7 ? '🌟' : STREAK_COINS[day]}</Text>
                  </View>
                ))}
              </View>

              <View style={s.bonusRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bonusTitle}>
                    {bonus.canClaim ? '🎁 Daily Bonus Ready!' : `Come back in ${bonus.hoursUntilNext}h`}
                  </Text>
                  <Text style={s.bonusSub}>
                    {bonus.canClaim
                      ? `Claim ${bonus.coinsToday} coins · Day ${bonus.nextStreak} streak`
                      : `Day ${bonus.streak} streak · Keep it up!`}
                  </Text>
                </View>

                {bonus.canClaim ? (
                  <Animated.View style={{ transform: [{ scale: pulse }] }}>
                    <Pressable style={s.claimBtn} onPress={handleClaimBonus} disabled={claiming}>
                      {claiming
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <><MaterialCommunityIcons name="circle" size={14} color={colors.gold} /><Text style={s.claimText}>+{bonus.coinsToday}</Text></>
                      }
                    </Pressable>
                  </Animated.View>
                ) : (
                  <View style={s.claimedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                    <Text style={s.claimedText}>Claimed</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ── 7. PLAYER PROGRESS (COMPACT) ─────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionTitleRow}>
            <Text style={s.sectionEmoji}>📊</Text>
            <Text style={s.sectionTitle}>Your Performance</Text>
          </View>
          <View style={s.statsRow}>
            <StatCard label="Wins" value={String(stats.wins)} color={colors.accent} />
            <StatCard label="Losses" value={String(stats.losses)} color={colors.destructive} />
            <StatCard label="Win Rate" value={`${stats.winRate}%`} color={colors.primary} />
            <StatCard label="Best Streak" value={stats.bestStreak ? `${stats.bestStreak}🔥` : `${bonus?.streak || 0}🔥`} color={colors.gold} />
          </View>
        </View>

        {/* ── 8. RECENT GAMES ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Text style={s.sectionEmoji}>🕒</Text>
              <Text style={s.sectionTitle}>Recent Games</Text>
            </View>
            <Pressable onPress={() => router.push('/(tabs)/profile')}>
              <Text style={s.seeAllText}>See all →</Text>
            </Pressable>
          </View>

          {gameHistory.length === 0 ? (
            <View style={s.emptyGames}>
              <Text style={{ fontSize: 32 }}>🎮</Text>
              <Text style={s.emptyText}>No games yet — jump into the lobby!</Text>
            </View>
          ) : (
            gameHistory.slice(0, 5).map((g) => (
              <View key={g.id} style={s.recentGameCard}>
                <View style={[s.gameResultIcon, { backgroundColor: (g.won ? colors.accent : colors.destructive) + '20' }]}>
                  <Ionicons name={g.won ? 'trophy' : 'close-circle'} size={18} color={g.won ? colors.accent : colors.destructive} />
                </View>
                <View style={s.recentGameInfo}>
                  <Text style={s.recentGameTitle}>
                    {g.won ? 'Victory' : 'Defeat'} • {getGameTitle(g.gameType)}
                  </Text>
                  <Text style={s.recentGameSub}>
                    Opponent • {formatRelTime(g.timestamp)}
                  </Text>
                </View>
                <View style={s.recentCoinBadge}>
                  <MaterialCommunityIcons name="circle" size={10} color={g.won ? colors.accent : colors.destructive} />
                  <Text style={[s.recentCoinText, { color: g.won ? colors.accent : colors.destructive }]}>
                    {g.won ? `+${g.prize - g.stake}` : `-${g.stake}`} 🪙
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── 9. LEADERBOARD PREVIEW ───────────────────────────────────── */}
        {topPlayers.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionTitleRow}>
                <Text style={s.sectionEmoji}>🏆</Text>
                <Text style={s.sectionTitle}>Top Players This Week</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/leaderboard')}>
                <Text style={s.seeAllText}>See all →</Text>
              </Pressable>
            </View>
            {topPlayers.map((p, i) => (
              <View key={p.userId} style={[s.leaderRow, p.isMe && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}>
                <Text style={{ fontSize: 18, width: 26 }}>{['🥇', '🥈', '🥉'][i]}</Text>
                <View style={[s.miniAvatar, { borderColor: ['#F59E0B', '#C0C0C0', '#CD7F32'][i] }]}>
                  <Text style={[s.miniAvatarText, { color: ['#F59E0B', '#C0C0C0', '#CD7F32'][i] }]}>
                    {p.username.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text style={[s.leaderName, p.isMe && { color: colors.primary }]}>
                  {p.username}{p.isMe ? ' (you)' : ''}
                </Text>
                <Text style={[s.leaderWins, { color: colors.accent }]}>{p.wins} wins</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── INVITE FRIENDS PROMO ────────────────────────────────────── */}
        <Pressable style={s.referralPromo} onPress={() => router.push('/(tabs)/profile')}>
          <LinearGradient colors={['#0F4C81', '#1A6BB5']} style={s.referralGrad}>
            <Text style={s.referralEmoji}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.referralTitle}>Invite Friends — Earn Coins!</Text>
              <Text style={s.referralSub}>You get 25 coins · They get 20 coins free</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        </Pressable>

        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[sStyles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[sStyles.statValue, { color }]}>{value}</Text>
      <Text style={[sStyles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const sStyles = StyleSheet.create({
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
});

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // ── 1. Top Header ───────────────────────────────────────────────
    topHeader: { paddingTop: topPad + 10, paddingHorizontal: 20, paddingBottom: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    playerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary + '30', borderWidth: 2, borderColor: colors.primary + '60', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 16, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    playerDetails: { flex: 1 },
    greeting: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
    username: { fontSize: 17, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    tierPill: { backgroundColor: colors.primary + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
    tierText: { fontSize: 10, fontWeight: '600', color: colors.primary, fontFamily: 'Inter_600SemiBold' },
    streakPill: { backgroundColor: '#F59E0B20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
    streakText: { fontSize: 10, fontWeight: '600', color: '#F59E0B', fontFamily: 'Inter_600SemiBold' },

    topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    badgeDot: { position: 'absolute', top: -3, right: -3, backgroundColor: colors.accent, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: colors.background },
    badgeDotText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },

    // ── 2. Compact Balance Strip ────────────────────────────────────
    balanceStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
    balanceLeft: { flexDirection: 'column', gap: 2 },
    balanceLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
    balanceAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    depositBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    depositBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },

    scrollContent: { paddingHorizontal: 18, paddingVertical: 16, gap: 24, paddingBottom: 110 },
    section: { gap: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionEmoji: { fontSize: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    seeAllText: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_600SemiBold' },

    // ── 3. Featured Hero Section ────────────────────────────────────
    heroSection: { width: '100%' },
    heroCard: { width: '100%', height: 210, borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.primary + '80', position: 'relative' },
    heroBgImage: { width: '100%', height: '100%', position: 'absolute' },
    heroGradientOverlay: { ...StyleSheet.absoluteFillObject },
    heroContent: { flex: 1, padding: 18, justifyContent: 'space-between' },
    featuredBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    featuredTag: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    featuredTagText: { fontSize: 10, fontWeight: '700', color: '#FFF', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
    modeBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    modeBadgeText: { fontSize: 10, fontWeight: '600', color: '#FFF', fontFamily: 'Inter_600SemiBold' },
    heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', fontFamily: 'Inter_700Bold', marginTop: 4, letterSpacing: 0.5 },
    heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter_400Regular', marginTop: 2 },
    heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
    prizeTag: { flexDirection: 'column' },
    prizeTagLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_500Medium' },
    prizeValRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    prizeValText: { fontSize: 15, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold' },
    heroCtaBtn: { borderRadius: 12, overflow: 'hidden' },
    heroCtaInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10 },
    heroCtaText: { fontSize: 14, fontWeight: '800', color: '#FFF', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

    // ── 4. Popular Games Carousel ──────────────────────────────────
    horizontalCarousel: { gap: 14, paddingRight: 10 },
    gameCard: { width: 140, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    gameCardImageWrapper: { width: 140, height: 110, position: 'relative' },
    gameCardImage: { width: '100%', height: '100%' },
    gameCardImageOverlay: { ...StyleSheet.absoluteFillObject },
    gameTagBadge: { position: 'absolute', top: 6, left: 6, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
    gameTagText: { fontSize: 9, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    gameCardDetails: { padding: 10, gap: 4 },
    gameCardName: { fontSize: 13, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    gameCardPlayBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
    gameCardPlayText: { fontSize: 12, fontWeight: '600', color: colors.primary, fontFamily: 'Inter_600SemiBold' },

    // ── 5. Quick Clash Section ─────────────────────────────────────
    quickClashRow: { flexDirection: 'row', gap: 12 },
    quickCard: { flex: 1, borderRadius: 18, overflow: 'hidden', minHeight: 135 },
    quickCardPrimary: { borderWidth: 1, borderColor: colors.primary },
    quickCardSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    quickCardGrad: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
    quickCardInner: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
    quickIconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    quickCardTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', fontFamily: 'Inter_700Bold' },
    quickCardSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular' },
    quickCtaPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
    quickCtaText: { fontSize: 11, fontWeight: '700', color: '#FFF', fontFamily: 'Inter_700Bold' },

    quickCardTitleSecondary: { fontSize: 15, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    quickCardSubSecondary: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },

    // ── 6. Live Tournament Card ────────────────────────────────────
    tourneyCard: { width: '100%', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#3B0764' },
    tourneyGrad: { padding: 16, gap: 12 },
    tourneyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tourneyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
    tourneyBadgeText: { fontSize: 10, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold' },
    timerChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    timerChipText: { fontSize: 11, color: '#F59E0B', fontFamily: 'Inter_600SemiBold' },

    tourneyStatsGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12 },
    tourneyStatItem: { gap: 2 },
    tourneyStatLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular' },
    tourneyStatVal: { fontSize: 14, fontWeight: '700', color: '#FFF', fontFamily: 'Inter_700Bold' },
    tourneyCoinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

    tourneyFooter: { alignItems: 'flex-end' },
    tourneyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
    tourneyBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF', fontFamily: 'Inter_700Bold' },

    // ── Daily Bonus ────────────────────────────────────────────────
    bonusCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary + '40' },
    bonusGrad: { padding: 16, gap: 12 },
    streakDots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    dot: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
    dotActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    dotText: { fontSize: 11, color: '#fff', fontFamily: 'Inter_600SemiBold' },
    bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bonusTitle: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    bonusSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginTop: 2 },
    claimBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    claimText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    claimedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
    claimedText: { fontSize: 13, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

    // ── 7. Performance Stats ───────────────────────────────────────
    statsRow: { flexDirection: 'row', gap: 8 },

    // ── 8. Recent Games ────────────────────────────────────────────
    recentGameCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 12 },
    gameResultIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    recentGameInfo: { flex: 1 },
    recentGameTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    recentGameSub: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    recentCoinBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    recentCoinText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    emptyGames: { alignItems: 'center', gap: 8, paddingVertical: 24 },
    emptyText: { textAlign: 'center', color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_400Regular' },

    // ── 9. Leaderboard Preview ─────────────────────────────────────
    leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
    miniAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.card, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    miniAvatarText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    leaderName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    leaderWins: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter_700Bold' },

    // ── Referral Promo ─────────────────────────────────────────────
    referralPromo: { borderRadius: 16, overflow: 'hidden' },
    referralGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    referralEmoji: { fontSize: 26 },
    referralTitle: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    referralSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginTop: 2 },
  });
}
