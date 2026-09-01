import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, View, Pressable, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const ADMIN_EMAIL = 'admin@coinclash.com';

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Guard: only admin can see this
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      Alert.alert('Access Denied', 'This page is for admins only.');
      router.replace('/(tabs)');
    }
  }, [user]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getAdminStats(token);
      setStats(data);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load admin stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const onRefresh = () => { setRefreshing(true); fetchStats(); };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { flex: 1, paddingTop: insets.top + 16 },
    header: { paddingHorizontal: 20, paddingBottom: 20 },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
    scroll: { padding: 20, paddingBottom: 100, gap: 16 },
    card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
    cardTitle: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    label: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    value: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    highlight: { fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statBox: { width: '47%', backgroundColor: colors.background, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
    statNum: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    statLbl: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' },
    playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
    rank: { width: 24, fontSize: 14, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold', textAlign: 'center' },
    playerName: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    playerCoins: { fontSize: 13, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
    userRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    userName: { fontSize: 14, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    userEmail: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    emptyText: { color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12, fontFamily: 'Inter_400Regular' },
    gameTypeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    backText: { color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 },
  });

  if (loading) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Loading admin stats...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={s.gradient}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </Pressable>
          <Text style={s.title}>🛡️ Admin Panel</Text>
          <Text style={s.subtitle}>CoinClash live dashboard</Text>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* ── Overview Stats ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>📊 Overview</Text>
            <View style={s.statGrid}>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats?.users?.total ?? 0}</Text>
                <Text style={s.statLbl}>Total Users</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats?.users?.todaySignups ?? 0}</Text>
                <Text style={s.statLbl}>Today's Signups</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats?.games?.total ?? 0}</Text>
                <Text style={s.statLbl}>Total Games</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{stats?.games?.thisWeek ?? 0}</Text>
                <Text style={s.statLbl}>Games This Week</Text>
              </View>
            </View>
          </View>

          {/* ── Revenue ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>💰 Revenue</Text>
            <View style={s.row}>
              <Text style={s.label}>Total NGN Deposited</Text>
              <Text style={s.value}>₦{stats?.revenue?.totalNgn ?? '0'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.label}>Last 30 Days (NGN)</Text>
              <Text style={s.value}>₦{stats?.revenue?.last30DaysNgn ?? '0'}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Last 30 Days (Coins)</Text>
              <Text style={s.value}>{stats?.revenue?.last30DaysCoins ?? 0} 🪙</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.label}>Platform Fees Earned</Text>
              <Text style={[s.value, { color: colors.accent }]}>₦{stats?.revenue?.totalFeesNgn ?? '0'}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Uncollected Fees</Text>
              <Text style={[s.value, { color: colors.gold }]}>₦{stats?.revenue?.pendingFeesNgn ?? '0'}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Coins in All Wallets</Text>
              <Text style={s.value}>{stats?.revenue?.totalCoinsInWallets ?? 0} 🪙</Text>
            </View>
          </View>

          {/* ── Game Breakdown ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🎮 Games by Type</Text>
            {stats?.games?.byType?.length > 0 ? (
              stats.games.byType.map((g: any) => (
                <View key={g.game_type} style={s.gameTypeRow}>
                  <Text style={s.label}>{g.game_type}</Text>
                  <Text style={s.value}>{g.total} played · {g.wins} wins</Text>
                </View>
              ))
            ) : (
              <Text style={s.emptyText}>No games played yet</Text>
            )}
          </View>

          {/* ── Top Players ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🏆 Top Players</Text>
            {stats?.topPlayers?.length > 0 ? (
              stats.topPlayers.map((p: any, i: number) => (
                <View key={p.id} style={s.playerRow}>
                  <Text style={s.rank}>#{i + 1}</Text>
                  <Text style={s.playerName}>{p.username}</Text>
                  <Text style={s.playerCoins}>{p.coin_balance} 🪙</Text>
                </View>
              ))
            ) : (
              <Text style={s.emptyText}>No players yet</Text>
            )}
          </View>

          {/* ── Pending Withdrawals ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>⏳ Pending Withdrawals</Text>
            {stats?.pendingWithdrawals?.length > 0 ? (
              stats.pendingWithdrawals.map((w: any) => (
                <View key={w.id} style={s.userRow}>
                  <Text style={s.userName}>{w.username} — ₦{w.amount_ngn}</Text>
                  <Text style={s.userEmail}>{w.description}</Text>
                </View>
              ))
            ) : (
              <Text style={s.emptyText}>No pending withdrawals 🎉</Text>
            )}
          </View>

          {/* ── Recent Signups ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🆕 Recent Signups</Text>
            {stats?.users?.recentSignups?.length > 0 ? (
              stats.users.recentSignups.map((u: any) => (
                <View key={u.id} style={s.userRow}>
                  <Text style={s.userName}>{u.username}</Text>
                  <Text style={s.userEmail}>{u.email} · {u.coin_balance} 🪙</Text>
                </View>
              ))
            ) : (
              <Text style={s.emptyText}>No signups yet</Text>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}
