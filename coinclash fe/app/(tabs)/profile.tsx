import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useWallet } from '@/context/WalletContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet,
  Share, Text, TextInput, View, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACHIEVEMENTS = [
  { id: 'first_win',   icon: '🏆', title: 'First Victory',   desc: 'Win your first match',    check: (s: any) => s.wins >= 1   },
  { id: 'five_wins',   icon: '⚡', title: 'On Fire',         desc: 'Win 5 matches',            check: (s: any) => s.wins >= 5   },
  { id: 'twenty_wins', icon: '💎', title: 'Diamond Hands',   desc: 'Win 20 matches',           check: (s: any) => s.wins >= 20  },
  { id: 'veteran',     icon: '🎖️', title: 'Veteran',         desc: 'Play 50 matches',          check: (s: any) => s.wins + s.losses >= 50 },
  { id: 'legend',      icon: '👑', title: 'Legend',          desc: 'Win 100 matches',          check: (s: any) => s.wins >= 100 },
  { id: 'streak3',     icon: '🔥', title: 'Hot Streak',      desc: 'Log in 3 days in a row',   check: (s: any) => (s.streak ?? 0) >= 3 },
  { id: 'streak7',     icon: '🌟', title: 'Dedicated',       desc: 'Claim 7-day streak bonus', check: (s: any) => (s.streak ?? 0) >= 7 },
  { id: 'referral1',   icon: '👥', title: 'Recruiter',       desc: 'Refer your first friend',  check: (s: any) => (s.referrals ?? 0) >= 1 },
];

function getLevelInfo(wins: number, total: number) {
  if (total >= 100 || wins >= 100) return { label: 'Legend', color: '#F59E0B', next: null };
  if (total >= 50  || wins >= 50)  return { label: 'Elite',  color: '#8B5CF6', next: 100 };
  if (total >= 20  || wins >= 20)  return { label: 'Pro',    color: '#3B82F6', next: 50  };
  if (total >= 5)                   return { label: 'Skilled',color: '#10B981', next: 20  };
  return { label: 'Rookie', color: '#6B7280', next: 5 };
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, token, refreshUser } = useAuth();
  const { coins } = useWallet();
  const { stats } = useGame();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  // Referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState({ totalReferrals: 0, converted: 0, coinsEarned: 0 });
  const [referralStatus, setReferralStatus] = useState<{ hasReferral: boolean; bonusPaid: boolean; referrerUsername: string | null } | null>(null);
  const [applyCode, setApplyCode] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [showApplyCode, setShowApplyCode] = useState(false);
  const [loadingReferral, setLoadingReferral] = useState(false);

  // Streak
  const [streak, setStreak] = useState(0);

  // Admin stats (owner only)
  const [adminStats, setAdminStats] = useState<any>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const isOwner = user?.id === 1;

  const loadReferral = useCallback(async () => {
    if (!token) return;
    setLoadingReferral(true);
    try {
      const [codeData, status, bonusData] = await Promise.all([
        api.getMyReferralCode(token),
        api.getReferralStatus(token),
        api.getBonusStatus(token),
      ]);
      setReferralCode(codeData.code);
      setReferralStats(codeData.stats);
      setReferralStatus(status);
      setStreak(bonusData.streak);
    } catch {}
    setLoadingReferral(false);
  }, [token]);

  const loadAdminStats = useCallback(async () => {
    if (!token || !isOwner) return;
    setLoadingAdmin(true);
    try { setAdminStats(await api.getAdminStats(token)); } catch {}
    setLoadingAdmin(false);
  }, [token, isOwner]);

  useEffect(() => {
    loadReferral();
    if (isOwner) loadAdminStats();
  }, [loadReferral, loadAdminStats]);

  const totalGames = stats.wins + stats.losses;
  const level = getLevelInfo(stats.wins, totalGames);
  const winRate = totalGames > 0 ? Math.round((stats.wins / totalGames) * 100) : 0;
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        await logout();
      }
    } else {
      Alert.alert('Log out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: async () => { await logout(); } },
      ]);
    }
  };

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || !token) return;
    setSavingUsername(true);
    try {
      await api.updateProfile(newUsername.trim(), token);
      await refreshUser();
      setEditingUsername(false);
      setNewUsername('');
      Alert.alert('Username updated!');
    } catch (err: any) { Alert.alert('Error', err.message); }
    setSavingUsername(false);
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    await Share.share({ message: `My CoinClash referral code is ${referralCode}` });
  };

  const handleShareCode = async () => {
    if (!referralCode) return;
    const msg = `Join me on CoinClash and get 20 free coins! Use my referral code: ${referralCode} when signing up 🎮\n\nDownload now and let's compete!`;
    try {
      await Share.share({ message: msg, title: 'Join me on CoinClash' });
    } catch {
      Alert.alert('Share message', msg);
    }
  };

  const handleApplyCode = async () => {
    if (!applyCode.trim() || !token) return;
    setApplyingCode(true);
    try {
      const result = await api.applyReferralCode(applyCode.trim(), token);
      Alert.alert('Code Applied! 🎉', result.message);
      setShowApplyCode(false);
      setApplyCode('');
      await loadReferral();
    } catch (err: any) { Alert.alert('Error', err.message); }
    setApplyingCode(false);
  };

  const achStats = { ...stats, streak, referrals: referralStats.totalReferrals };
  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0D0A2A', colors.background]} style={s.header}>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.username}>{user?.username ?? 'Player'}</Text>
          <Text style={s.email}>{user?.email}</Text>
          <View style={s.badgeRow}>
            <View style={s.levelBadge}>
              <MaterialCommunityIcons name="star" size={14} color={level.color} />
              <Text style={[s.levelText, { color: level.color }]}>{level.label}</Text>
              {level.next && <Text style={s.levelNext}>· {level.next - totalGames} to next</Text>}
            </View>
            {streak > 0 && (
              <View style={s.streakBadge}>
                <Text style={s.streakText}>🔥 {streak}-day streak</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Admin Dashboard (owner only) ─────────────────────────── */}
        {isOwner && (
          <View style={s.adminCard}>
            <View style={s.adminHeader}>
              <Ionicons name="stats-chart" size={18} color={colors.gold} />
              <Text style={s.adminTitle}>Platform Dashboard</Text>
              <Pressable onPress={loadAdminStats}>
                <Ionicons name="refresh" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {loadingAdmin ? <ActivityIndicator color={colors.primary} /> : adminStats ? (
              <>
                <View style={s.adminGrid}>
                  <AdminStat label="Total Users"  value={adminStats.users.total}                    color={colors.primary} />
                  <AdminStat label="Today"        value={`+${adminStats.users.todaySignups}`}        color={colors.accent}  />
                  <AdminStat label="Total Games"  value={adminStats.games.total}                    color={colors.primary} />
                  <AdminStat label="This Week"    value={adminStats.games.thisWeek}                 color={colors.accent}  />
                  <AdminStat label="Revenue (all)"value={`₦${adminStats.revenue.totalNgn}`}         color={colors.gold}    />
                  <AdminStat label="Last 30 days" value={`₦${adminStats.revenue.last30DaysNgn}`}    color={colors.gold}    />
                </View>
                {adminStats.pendingWithdrawals.length > 0 && (
                  <View style={s.adminAlert}>
                    <Ionicons name="warning" size={14} color={colors.gold} />
                    <Text style={s.adminAlertText}>{adminStats.pendingWithdrawals.length} pending withdrawal(s)</Text>
                  </View>
                )}
                {adminStats.topPlayers.length > 0 && (
                  <View>
                    <Text style={s.adminSubtitle}>Top Players</Text>
                    {adminStats.topPlayers.slice(0, 3).map((p: any, i: number) => (
                      <View key={i} style={s.adminPlayerRow}>
                        <Text style={s.adminPlayerName}>{p.username}</Text>
                        <Text style={s.adminPlayerStat}>{p.totalGames} games · {p.wins} wins</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <MaterialCommunityIcons name="circle" size={10} color={colors.gold} />
                          <Text style={[s.adminPlayerStat, { color: colors.gold }]}>{p.coinBalance}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : <Text style={s.empty}>Tap refresh to load stats</Text>}
          </View>
        )}

        {/* ── Stats ────────────────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Statistics</Text>
          <View style={s.statsGrid}>
            {[
              { val: stats.wins,   label: 'Wins',        color: colors.accent      },
              { val: stats.losses, label: 'Losses',      color: colors.destructive },
              { val: `${winRate}%`,label: 'Win Rate',    color: colors.primary     },
              { val: stats.bestTime ? `${stats.bestTime}ms` : '—', label: 'Best Time', color: colors.gold },
              { val: totalGames,   label: 'Total Games', color: colors.foreground  },
              { val: coins,        label: 'Coins',       color: colors.gold, isCoin: true },
            ].map((item) => (
              <View key={item.label} style={s.statCard}>
                {item.isCoin && <MaterialCommunityIcons name="circle" size={16} color={colors.gold} />}
                <Text style={[s.statVal, { color: item.color, fontSize: item.isCoin ? 18 : 24 }]}>{item.val}</Text>
                <Text style={s.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Referral System ──────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Referral Program</Text>
          {loadingReferral ? <ActivityIndicator color={colors.primary} /> : (
            <>
              {/* My code card */}
              {referralCode && (
                <View style={s.referralCard}>
                  <Text style={s.referralLabel}>Your Referral Code</Text>
                  <View style={s.codeRow}>
                    <Text style={s.codeText}>{referralCode}</Text>
                    <Pressable style={s.copyBtn} onPress={handleCopyCode}>
                      <Ionicons name="copy-outline" size={16} color={colors.primary} />
                    </Pressable>
                    <Pressable style={s.shareBtn} onPress={handleShareCode}>
                      <Ionicons name="share-social-outline" size={16} color="#fff" />
                      <Text style={s.shareBtnText}>Share</Text>
                    </Pressable>
                  </View>
                  <View style={s.referralStats}>
                    <View style={s.refStat}>
                      <Text style={s.refStatVal}>{referralStats.totalReferrals}</Text>
                      <Text style={s.refStatLabel}>Invited</Text>
                    </View>
                    <View style={s.refStat}>
                      <Text style={[s.refStatVal, { color: colors.accent }]}>{referralStats.converted}</Text>
                      <Text style={s.refStatLabel}>Deposited</Text>
                    </View>
                    <View style={s.refStat}>
                      <Text style={[s.refStatVal, { color: colors.gold }]}>{referralStats.coinsEarned}</Text>
                      <Text style={s.refStatLabel}>Coins Earned</Text>
                    </View>
                  </View>
                  <Text style={s.referralHint}>
                    You earn <Text style={{ color: colors.gold }}>25 coins</Text> · Friends earn <Text style={{ color: colors.accent }}>20 coins</Text> on first deposit
                  </Text>
                </View>
              )}

              {/* Apply code (if not already referred) */}
              {!referralStatus?.hasReferral && (
                <View style={s.applySection}>
                  {!showApplyCode ? (
                    <Pressable style={s.applyTrigger} onPress={() => setShowApplyCode(true)}>
                      <Ionicons name="ticket-outline" size={16} color={colors.primary} />
                      <Text style={s.applyTriggerText}>Have a friend's code? Apply it</Text>
                    </Pressable>
                  ) : (
                    <View style={s.applyRow}>
                      <TextInput
                        style={s.applyInput}
                        placeholder="Enter referral code"
                        placeholderTextColor={colors.mutedForeground}
                        value={applyCode}
                        onChangeText={(v) => setApplyCode(v.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={8}
                      />
                      <Pressable style={s.applyBtn} onPress={handleApplyCode} disabled={applyingCode}>
                        {applyingCode ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.applyBtnText}>Apply</Text>}
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* Referred by status */}
              {referralStatus?.hasReferral && (
                <View style={s.referredByCard}>
                  <Ionicons name="people" size={16} color={colors.accent} />
                  <Text style={s.referredByText}>
                    Referred by <Text style={{ color: colors.accent, fontFamily: 'Inter_600SemiBold' }}>{referralStatus.referrerUsername}</Text>
                    {referralStatus.bonusPaid ? ' · 20 bonus coins received ✅' : ' · Bonus on first deposit'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Achievements ─────────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Achievements</Text>
          {ACHIEVEMENTS.map((a) => {
            const unlocked = a.check(achStats);
            return (
              <View key={a.id} style={[s.achievementRow, { opacity: unlocked ? 1 : 0.45 }]}>
                <Text style={s.achievIcon}>{a.icon}</Text>
                <View style={s.achievInfo}>
                  <Text style={s.achievTitle}>{a.title}</Text>
                  <Text style={s.achievDesc}>{a.desc}</Text>
                </View>
                {unlocked && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
              </View>
            );
          })}
        </View>

        {/* ── Settings ─────────────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Settings</Text>

          {editingUsername ? (
            <View style={[s.settingsItem, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
              <Text style={s.settingsText}>Change Username</Text>
              <View style={s.editRow}>
                <TextInput style={s.editInput} value={newUsername} onChangeText={setNewUsername}
                  placeholder={user?.username ?? 'New username'} placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none" autoFocus />
                <Pressable style={s.editSave} onPress={handleSaveUsername} disabled={savingUsername}>
                  <Text style={s.editSaveText}>{savingUsername ? '...' : 'Save'}</Text>
                </Pressable>
                <Pressable style={s.editCancel} onPress={() => { setEditingUsername(false); setNewUsername(''); }}>
                  <Ionicons name="close" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={s.settingsItem} onPress={() => setEditingUsername(true)}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} />
              <Text style={s.settingsText}>Change Username</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}

          <Pressable style={s.settingsItem} onPress={() => router.push('/(tabs)/wallet')}>
            <Ionicons name="card-outline" size={18} color={colors.mutedForeground} />
            <Text style={s.settingsText}>Bank Accounts & Payments</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable style={s.settingsItem} onPress={() => router.push('/(tabs)/leaderboard')}>
            <Ionicons name="trophy-outline" size={18} color={colors.mutedForeground} />
            <Text style={s.settingsText}>Leaderboard</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable style={[s.settingsItem, s.logoutItem]} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
            <Text style={[s.settingsText, s.logoutText]}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function AdminStat({ label, value, color }: { label: string; value: any; color: string }) {
  const colors = useColors();
  return (
    <View style={{ width: '31%', backgroundColor: colors.background, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color, fontFamily: 'Inter_700Bold' }}>{value}</Text>
      <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 32 },
    avatarRow: { alignItems: 'center', gap: 8 },
    avatar: { width: 88, height: 88, borderRadius: 24, backgroundColor: colors.primary + '30', borderWidth: 3, borderColor: colors.primary + '60', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 32, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    username: { fontSize: 24, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    email: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    badgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
    levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    levelText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
    levelNext: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    streakBadge: { backgroundColor: '#F59E0B20', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#F59E0B40' },
    streakText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#F59E0B' },

    scroll: { padding: 20, paddingBottom: 120, gap: 24 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
    empty: { color: colors.mutedForeground, textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 13 },

    // Admin card
    adminCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.gold + '40', padding: 16, gap: 14 },
    adminHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    adminTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold' },
    adminGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    adminAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.gold + '15', borderRadius: 10, padding: 10 },
    adminAlertText: { fontSize: 13, color: colors.gold, fontFamily: 'Inter_500Medium' },
    adminSubtitle: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    adminPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    adminPlayerName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    adminPlayerStat: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },

    // Stats
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: { width: '47%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 4 },
    statVal: { fontSize: 24, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },

    // Referral
    referralCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.primary + '40', padding: 16, gap: 14, marginBottom: 10 },
    referralLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.8 },
    codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    codeText: { flex: 1, fontSize: 28, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
    copyBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
    shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    shareBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    referralStats: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 0 },
    refStat: { flex: 1, alignItems: 'center', gap: 2 },
    refStatVal: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    refStatLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },
    referralHint: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 18 },
    applySection: { marginBottom: 10 },
    applyTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
    applyTriggerText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    applyRow: { flexDirection: 'row', gap: 8 },
    applyInput: { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground, fontFamily: 'Inter_700Bold', letterSpacing: 3 },
    applyBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
    applyBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    referredByCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accent + '12', borderRadius: 10, borderWidth: 1, borderColor: colors.accent + '30', padding: 12 },
    referredByText: { flex: 1, fontSize: 13, color: colors.foreground, fontFamily: 'Inter_400Regular', lineHeight: 18 },

    // Achievements
    achievementRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12, marginBottom: 8 },
    achievIcon: { fontSize: 24 },
    achievInfo: { flex: 1 },
    achievTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    achievDesc: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },

    // Settings
    settingsItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 12, marginBottom: 8 },
    settingsText: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    logoutItem: { borderColor: colors.destructive + '40' },
    logoutText: { color: colors.destructive },
    editRow: { flexDirection: 'row', gap: 8, alignItems: 'center', width: '100%' },
    editInput: { flex: 1, backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
    editSave: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
    editSaveText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    editCancel: { paddingHorizontal: 10, paddingVertical: 10 },
  });
}
