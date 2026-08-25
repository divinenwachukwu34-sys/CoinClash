import { CoinBadge } from '@/components/CoinBadge';
import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, type BonusStatus, type LeaderboardEntry } from '@/lib/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STREAK_COINS = [0, 15, 20, 25, 30, 35, 40, 50];

function getLevelInfo(totalGames: number) {
  if (totalGames >= 100) return { label: 'Legend', color: '#F59E0B', icon: '👑' };
  if (totalGames >= 50)  return { label: 'Elite',  color: '#8B5CF6', icon: '💎' };
  if (totalGames >= 20)  return { label: 'Pro',    color: '#3B82F6', icon: '🏆' };
  if (totalGames >= 5)   return { label: 'Skilled',color: '#10B981', icon: '⚡' };
  return { label: 'Rookie', color: '#6B7280', icon: '🎮' };
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coins, syncFromServer, addTransaction } = useWallet();
  const { stats, gameHistory } = useGame();
  const { user, token } = useAuth();
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
        Animated.timing(pulse, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bonus?.canClaim]);

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

  const formatRelTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return 'Just now';
  };

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1A0A3A', colors.background]} style={s.header}>
        {/* Profile Row */}
        <View style={s.profileRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.greeting}>Welcome back 👋</Text>
            <Text style={s.username}>{user?.username ?? 'Player'}</Text>
            <View style={s.levelBadge}>
              <Text style={{ fontSize: 10 }}>{level.icon}</Text>
              <Text style={[s.levelText, { color: level.color }]}>{level.label}</Text>
              {bonus && bonus.streak > 0 && (
                <View style={s.streakPill}>
                  <Text style={s.streakPillText}>🔥 {bonus.streak}</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable style={s.notifBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Balance Card */}
        <View style={s.balanceCard}>
          <View>
            <Text style={s.balanceLabel}>Your Balance</Text>
            <View style={s.balanceRow}>
              <CoinBadge amount={coins} size="lg" />
            </View>
          </View>
          <Pressable style={s.depositLink} onPress={() => router.push('/(tabs)/wallet')}>
            <Ionicons name="add-circle" size={14} color={colors.accent} />
            <Text style={s.depositText}>Deposit</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Daily Bonus Card ─────────────────────────────────────────── */}
        {bonus && (
          <View style={s.bonusCard}>
            <LinearGradient
              colors={bonus.canClaim ? ['#4F1ADE', '#7C3AED'] : ['#1E1E2E', '#1E1E2E']}
              style={s.bonusGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              {/* Streak dots */}
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

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Your Stats</Text>
          <View style={s.statsRow}>
            <StatCard label="Wins"     value={String(stats.wins)}              color={colors.accent}      />
            <StatCard label="Losses"   value={String(stats.losses)}            color={colors.destructive} />
            <StatCard label="Win Rate" value={`${stats.winRate}%`}             color={colors.primary}     />
            <StatCard label="Best"     value={stats.bestTime ? `${stats.bestTime}ms` : '—'} color={colors.gold} />
          </View>
        </View>

        {/* ── Quick Play ───────────────────────────────────────────────── */}
        <View style={s.playBtn}>
          <Pressable onPress={() => router.push('/(tabs)/lobby')}>
            <LinearGradient colors={[colors.primary, '#4F1ADE']} style={s.playBtnInner}>
              <Ionicons name="game-controller" size={22} color="#fff" />
              <Text style={s.playBtnText}>Find a Match</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* ── Weekly Leaderboard Preview ───────────────────────────────── */}
        {topPlayers.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>🏆 Top Players This Week</Text>
              <Pressable onPress={() => router.push('/(tabs)/leaderboard')}>
                <Text style={s.seeAll}>See all →</Text>
              </Pressable>
            </View>
            {topPlayers.map((p, i) => (
              <View key={p.userId} style={[s.leaderRow, p.isMe && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}>
                <Text style={{ fontSize: 18, width: 28 }}>{['🥇','🥈','🥉'][i]}</Text>
                <View style={[s.miniAvatar, { borderColor: ['#F59E0B','#C0C0C0','#CD7F32'][i] }]}>
                  <Text style={[s.miniAvatarText, { color: ['#F59E0B','#C0C0C0','#CD7F32'][i] }]}>
                    {p.username.slice(0,2).toUpperCase()}
                  </Text>
                </View>
                <Text style={[s.leaderName, p.isMe && { color: colors.primary }]}>{p.username}{p.isMe ? ' (you)' : ''}</Text>
                <Text style={[s.leaderWins, { color: colors.accent }]}>{p.wins} wins</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Recent Games ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Games</Text>
          {gameHistory.length === 0 ? (
            <View style={s.emptyGames}>
              <Text style={{ fontSize: 32 }}>🎮</Text>
              <Text style={s.emptyText}>No games yet — jump into the lobby!</Text>
            </View>
          ) : (
            gameHistory.slice(0, 10).map((g) => (
              <View key={g.id} style={s.recentGame}>
                <View style={[s.gameIcon, { backgroundColor: (g.won ? colors.accent : colors.destructive) + '20' }]}>
                  <Ionicons name={g.won ? 'trophy' : 'close-circle'} size={18}
                    color={g.won ? colors.accent : colors.destructive} />
                </View>
                <View style={s.gameInfo}>
                  <Text style={s.gameTitle}>{g.won ? 'Victory' : 'Defeat'} · {g.stake} coin stake</Text>
                  <Text style={s.gameTime}>{g.playerTime}ms vs {g.opponentTime}ms · {formatRelTime(g.timestamp)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MaterialCommunityIcons name="circle" size={10} color={g.won ? colors.accent : colors.destructive} />
                  <Text style={[s.gameAmount, { color: g.won ? colors.accent : colors.destructive }]}>
                    {g.won ? `+${g.prize - g.stake}` : `-${g.stake}`}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Invite Friends promo ─────────────────────────────────────── */}
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

        <View style={{ height: 20 }} />
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
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
});

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 24 },

    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary + '30', borderWidth: 2, borderColor: colors.primary + '60', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    profileInfo: { flex: 1 },
    greeting: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular' },
    username: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    levelText: { fontSize: 11, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
    streakPill: { backgroundColor: '#F59E0B20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
    streakPillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#F59E0B' },
    notifBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

    balanceCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    balanceLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, textTransform: 'uppercase' },
    balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    depositLink: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    depositText: { fontSize: 13, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

    scrollContent: { padding: 20, paddingBottom: 120, gap: 20 },
    section: { gap: 10 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 },
    seeAll: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_500Medium' },

    // Bonus card
    bonusCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary + '40' },
    bonusGrad: { padding: 16, gap: 12 },
    streakDots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    dot: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
    dotActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    dotText: { fontSize: 11, color: '#fff', fontFamily: 'Inter_600SemiBold' },
    bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bonusTitle: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    bonusSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginTop: 2 },
    claimBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
    claimText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    claimedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
    claimedText: { fontSize: 13, color: colors.accent, fontFamily: 'Inter_600SemiBold' },

    statsRow: { flexDirection: 'row', gap: 10 },
    playBtn: { borderRadius: colors.radius, overflow: 'hidden' },
    playBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
    playBtnText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },

    // Leaderboard preview
    leaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
    miniAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.card, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    miniAvatarText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    leaderName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    leaderWins: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold' },

    recentGame: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12 },
    gameIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    gameInfo: { flex: 1 },
    gameTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    gameTime: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    gameAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    emptyGames: { alignItems: 'center', gap: 8, paddingVertical: 24 },
    emptyText: { textAlign: 'center', color: colors.mutedForeground, fontSize: 14, fontFamily: 'Inter_400Regular' },

    referralPromo: { borderRadius: 16, overflow: 'hidden' },
    referralGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    referralEmoji: { fontSize: 28 },
    referralTitle: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    referralSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginTop: 2 },
  });
}
