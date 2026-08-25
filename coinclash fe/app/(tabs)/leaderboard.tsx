import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, type LeaderboardEntry } from '@/lib/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [tab, setTab] = useState<'weekly' | 'alltime'>('weekly');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (!token) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await api.getLeaderboard(tab, token);
      setBoard(data.board);
      setMyRank(data.myRank);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [tab, token]);

  useEffect(() => { load(); }, [load]);

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0A1628', colors.background]} style={s.header}>
        <Text style={s.title}>Leaderboard</Text>
        <Text style={s.subtitle}>Top players competing for glory</Text>

        {/* Tab toggle */}
        <View style={s.toggle}>
          {(['weekly', 'alltime'] as const).map((t) => (
            <Pressable key={t} style={[s.toggleBtn, tab === t && s.toggleActive]} onPress={() => setTab(t)}>
              <Text style={[s.toggleText, tab === t && s.toggleTextActive]}>
                {t === 'weekly' ? '📅 This Week' : '🏆 All Time'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* My rank */}
        {myRank && (
          <View style={s.myRankCard}>
            <Ionicons name="trophy" size={16} color={colors.gold} />
            <Text style={s.myRankText}>Your rank: #{myRank}</Text>
          </View>
        )}
      </LinearGradient>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          {board.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🎮</Text>
              <Text style={s.emptyTitle}>No players yet</Text>
              <Text style={s.emptyDesc}>Be the first to play and claim the top spot!</Text>
            </View>
          ) : (
            board.map((player) => (
              <PlayerRow key={player.userId} player={player} colors={colors} />
            ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

function PlayerRow({ player, colors }: { player: LeaderboardEntry; colors: any }) {
  const s = makeStyles(colors, 0);
  const medal = MEDAL[player.rank - 1];
  const isTop3 = player.rank <= 3;
  const rankColor = player.rank === 1 ? colors.gold : player.rank === 2 ? '#C0C0C0' : player.rank === 3 ? '#CD7F32' : colors.mutedForeground;

  return (
    <View style={[
      s.playerRow,
      player.isMe && { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
      isTop3 && { borderColor: rankColor + '40' },
    ]}>
      {/* Rank */}
      <View style={s.rankBox}>
        {medal ? (
          <Text style={{ fontSize: 22 }}>{medal}</Text>
        ) : (
          <Text style={[s.rankNum, { color: rankColor }]}>#{player.rank}</Text>
        )}
      </View>

      {/* Avatar */}
      <View style={[s.avatar, isTop3 && { borderColor: rankColor }]}>
        <Text style={[s.avatarText, { color: isTop3 ? rankColor : colors.primary }]}>
          {player.username.slice(0, 2).toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.playerName, player.isMe && { color: colors.primary }]}>
            {player.username}
          </Text>
          {player.isMe && <Text style={s.youBadge}>YOU</Text>}
          {player.loginStreak >= 3 && (
            <Text style={s.streakBadge}>🔥{player.loginStreak}</Text>
          )}
        </View>
        <Text style={s.playerSub}>{player.totalGames} games · {player.wins}W/{player.losses}L</Text>
      </View>

      {/* Coins */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.wins, { color: isTop3 ? rankColor : colors.accent }]}>{player.wins} W</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <MaterialCommunityIcons name="circle" size={9} color={player.netCoins >= 0 ? colors.accent : colors.destructive} />
          <Text style={[s.netCoins, { color: player.netCoins >= 0 ? colors.accent : colors.destructive }]}>
            {player.netCoins >= 0 ? '+' : ''}{player.netCoins}
          </Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },

    toggle: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    toggleActive: { backgroundColor: colors.primary },
    toggleText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
    toggleTextActive: { color: '#fff' },

    myRankCard: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.gold + '18', borderRadius: 10,
      borderWidth: 1, borderColor: colors.gold + '40',
      paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    },
    myRankText: { fontSize: 14, fontWeight: '600', color: colors.gold, fontFamily: 'Inter_600SemiBold' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, gap: 8 },

    playerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
      borderColor: colors.border, padding: 14,
    },
    rankBox: { width: 32, alignItems: 'center' },
    rankNum: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    avatar: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: colors.primary + '20', borderWidth: 2, borderColor: colors.primary + '40',
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontSize: 14, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    playerName: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    youBadge: {
      fontSize: 9, fontFamily: 'Inter_700Bold', color: colors.primary,
      backgroundColor: colors.primary + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
    },
    streakBadge: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    playerSub: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    wins: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    netCoins: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

    empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    emptyDesc: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  });
}
