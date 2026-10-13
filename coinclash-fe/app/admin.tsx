import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, type SupportTicket } from '@/lib/api';

type TabKey = 'overview' | 'users' | 'transactions' | 'support' | 'reports';

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, authLoading, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Overview State
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [flagReasonInput, setFlagReasonInput] = useState('');

  // Transactions State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [txStatusFilter, setTxStatusFilter] = useState('all');
  const [txLoading, setTxLoading] = useState(false);

  // Support State
  const [openTicketCount, setOpenTicketCount] = useState(0);

  // Reports State
  const [reportSubTab, setReportSubTab] = useState<'security' | 'referrals'>('security');
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Auth Guard: Only dedicated admin or owner accounts can view this dashboard
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    const isOwnerOrAdmin = Boolean(user.isAdmin || user.role === 'admin' || user.role === 'owner');
    if (!isOwnerOrAdmin) {
      Alert.alert('Access Denied', 'This dashboard is restricted to administrators and the owner.');
      router.replace('/(tabs)');
    }
  }, [user, authLoading]);

  // Load Overview Stats
  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getAdminStats(token);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [token]);

  // Load Users List
  const loadUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    try {
      const params: any = { limit: 50, offset: 0 };
      if (userSearch.trim()) params.search = userSearch.trim();
      if (userStatusFilter !== 'all') params.status = userStatusFilter;
      if (flaggedOnly) params.flagged = true;

      const data = await api.getAdminUsers(token, params);
      setUsers(data?.users || []);
      setTotalUsers(data?.total || 0);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, [token, userSearch, userStatusFilter, flaggedOnly]);

  // Load Transactions List
  const loadTransactions = useCallback(async () => {
    if (!token) return;
    setTxLoading(true);
    try {
      const params: any = { limit: 50, offset: 0 };
      if (txTypeFilter !== 'all') params.type = txTypeFilter;
      if (txStatusFilter !== 'all') params.status = txStatusFilter;

      const data = await api.getAdminTransactions(token, params);
      setTransactions(data?.transactions || []);
      setTotalTransactions(data?.total || 0);
    } catch (err: any) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, [token, txTypeFilter, txStatusFilter]);

  // Load Support Ticket Counts
  const loadSupportMeta = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getAdminTickets(token, { status: 'OPEN' });
      setOpenTicketCount(data?.counts?.open ?? data?.total ?? 0);
    } catch (err: any) {
      console.error('Failed to load support summary:', err);
    }
  }, [token]);

  // Load Reports
  const loadReports = useCallback(async () => {
    if (!token) return;
    setReportsLoading(true);
    try {
      if (reportSubTab === 'security') {
        const data = await api.getAdminSecurityLogs(token, { limit: 50 });
        setSecurityLogs(data?.logs || []);
      } else {
        const data = await api.getAdminReferrals(token);
        setReferrals(data?.referrals || []);
      }
    } catch (err: any) {
      console.error('Failed to load reports:', err);
    } finally {
      setReportsLoading(false);
    }
  }, [token, reportSubTab]);

  // Load active tab data
  useEffect(() => {
    if (!token) return;
    if (activeTab === 'overview') {
      loadStats();
      loadSupportMeta();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'transactions') {
      loadTransactions();
    } else if (activeTab === 'support') {
      loadSupportMeta();
    } else if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab, token, loadStats, loadUsers, loadTransactions, loadSupportMeta, loadReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'overview') {
      await Promise.all([loadStats(), loadSupportMeta()]);
    } else if (activeTab === 'users') {
      await loadUsers();
    } else if (activeTab === 'transactions') {
      await loadTransactions();
    } else if (activeTab === 'support') {
      await loadSupportMeta();
    } else if (activeTab === 'reports') {
      await loadReports();
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to exit the admin dashboard?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  // User Actions
  const openUserModal = async (u: any) => {
    setSelectedUser(u);
    setFlagReasonInput(u.flag_reason || '');
    if (!token) return;
    setUserDetailLoading(true);
    try {
      const details = await api.getAdminUserDetail(u.id, token);
      if (details?.user) {
        setSelectedUser(details.user);
        setFlagReasonInput(details.user.flag_reason || '');
      }
    } catch (err) {
      console.error('Failed to load user detail:', err);
    } finally {
      setUserDetailLoading(false);
    }
  };

  const handleUpdateStatus = (newStatus: 'active' | 'suspended' | 'banned') => {
    if (!selectedUser || !token) return;
    Alert.alert('Confirm Status Change', `Change status of @${selectedUser.username} to ${newStatus.toUpperCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: newStatus === 'active' ? 'default' : 'destructive',
        onPress: async () => {
          try {
            await api.updateAdminUserStatus(selectedUser.id, newStatus, token);
            Alert.alert('Success', `User status changed to ${newStatus}`);
            setSelectedUser({ ...selectedUser, status: newStatus });
            loadUsers();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to update user status');
          }
        },
      },
    ]);
  };

  const handleToggleFlag = async () => {
    if (!selectedUser || !token) return;
    const nextFlag = !selectedUser.is_flagged;
    try {
      await api.flagAdminUser(selectedUser.id, nextFlag, flagReasonInput.trim(), token);
      Alert.alert('Success', nextFlag ? 'User flagged' : 'User unflagged');
      setSelectedUser({
        ...selectedUser,
        is_flagged: nextFlag,
        flag_reason: nextFlag ? flagReasonInput.trim() : null,
      });
      loadUsers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update flag state');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'success':
        return '#16a34a';
      case 'suspended':
      case 'pending':
        return '#d97706';
      case 'banned':
      case 'failed':
        return '#dc2626';
      default:
        return colors.mutedForeground;
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: { flex: 1, paddingTop: insets.top + 10 },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandText: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      backgroundColor: colors.primary + '25',
      borderWidth: 1,
      borderColor: colors.primary + '50',
    },
    roleBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
      textTransform: 'uppercase',
    },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.destructive + '15',
    },
    logoutBtnText: { fontSize: 13, color: colors.destructive, fontFamily: 'Inter_600SemiBold' },
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card + '40',
    },
    tabItem: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
    tabTextActive: { color: colors.primary, fontFamily: 'Inter_600SemiBold' },
    badgeCount: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 18,
      alignItems: 'center',
    },
    badgeCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    scrollContent: { padding: 16, paddingBottom: 60, gap: 14 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statBox: {
      width: '48%',
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statNum: { fontSize: 24, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    statLbl: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    label: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    value: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      paddingLeft: 8,
      color: colors.foreground,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
    },
    filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    filterChipText: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
    filterChipTextActive: { color: colors.primary, fontFamily: 'Inter_600SemiBold' },
    userItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    userName: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    userEmail: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    emptyText: { textAlign: 'center', color: colors.mutedForeground, paddingVertical: 24, fontFamily: 'Inter_400Regular' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    modalBody: { gap: 12 },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    // Support Quick Links
    supportCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 12,
    },
  });

  if (statsLoading && activeTab === 'overview') {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Loading admin dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={s.gradient}>
        {/* ── Top Navigation Bar ── */}
        <View style={s.topBar}>
          <View style={s.brandRow}>
            <Text style={s.brandText}>🛡️ CoinClash</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleBadgeText}>{user?.role === 'owner' ? 'OWNER' : 'ADMIN'}</Text>
            </View>
          </View>

          <View style={s.topActions}>
            <Pressable style={s.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={16} color={colors.destructive} />
              <Text style={s.logoutBtnText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Horizontal Navigation Tabs ── */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
            <Pressable
              style={[s.tabItem, activeTab === 'overview' && s.tabItemActive]}
              onPress={() => setActiveTab('overview')}
            >
              <Ionicons
                name="pie-chart-outline"
                size={16}
                color={activeTab === 'overview' ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabText, activeTab === 'overview' && s.tabTextActive]}>Overview</Text>
            </Pressable>

            <Pressable
              style={[s.tabItem, activeTab === 'users' && s.tabItemActive]}
              onPress={() => setActiveTab('users')}
            >
              <Ionicons
                name="people-outline"
                size={16}
                color={activeTab === 'users' ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabText, activeTab === 'users' && s.tabTextActive]}>Users</Text>
            </Pressable>

            <Pressable
              style={[s.tabItem, activeTab === 'transactions' && s.tabItemActive]}
              onPress={() => setActiveTab('transactions')}
            >
              <Ionicons
                name="card-outline"
                size={16}
                color={activeTab === 'transactions' ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabText, activeTab === 'transactions' && s.tabTextActive]}>Transactions</Text>
            </Pressable>

            <Pressable
              style={[s.tabItem, activeTab === 'support' && s.tabItemActive]}
              onPress={() => setActiveTab('support')}
            >
              <Ionicons
                name="help-buoy-outline"
                size={16}
                color={activeTab === 'support' ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabText, activeTab === 'support' && s.tabTextActive]}>Support</Text>
              {openTicketCount > 0 && (
                <View style={s.badgeCount}>
                  <Text style={s.badgeCountText}>{openTicketCount}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={[s.tabItem, activeTab === 'reports' && s.tabItemActive]}
              onPress={() => setActiveTab('reports')}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={activeTab === 'reports' ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabText, activeTab === 'reports' && s.tabTextActive]}>Reports</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* ── Main Tab Content ── */}
        <ScrollView
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Quick Support Banner */}
              <Pressable style={s.supportCard} onPress={() => router.push('/admin/support' as any)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' }}>
                      🎧 Customer Care & Tickets
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                      {openTicketCount} open support tickets require attention
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                </View>
              </Pressable>

              {/* Stats Grid */}
              <View style={s.card}>
                <Text style={s.cardTitle}>📊 Platform Activity</Text>
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
                    <Text style={s.statLbl}>Total Matches Played</Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={s.statNum}>{stats?.games?.thisWeek ?? 0}</Text>
                    <Text style={s.statLbl}>Matches This Week</Text>
                  </View>
                </View>
              </View>

              {/* Revenue Card */}
              <View style={s.card}>
                <Text style={s.cardTitle}>💰 Financial Summary</Text>
                <View style={s.row}>
                  <Text style={s.label}>Total Deposits (NGN)</Text>
                  <Text style={s.value}>₦{stats?.revenue?.totalNgn ?? '0'}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Deposits in Last 30 Days</Text>
                  <Text style={s.value}>₦{stats?.revenue?.last30DaysNgn ?? '0'}</Text>
                </View>
                <View style={s.divider} />
                <View style={s.row}>
                  <Text style={s.label}>Platform Fees Realized</Text>
                  <Text style={[s.value, { color: colors.accent }]}>₦{stats?.revenue?.totalFeesNgn ?? '0'}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Uncollected Game Fees</Text>
                  <Text style={[s.value, { color: colors.gold }]}>₦{stats?.revenue?.pendingFeesNgn ?? '0'}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Total Coins in Circulation</Text>
                  <Text style={s.value}>{stats?.revenue?.totalCoinsInWallets ?? 0} 🪙</Text>
                </View>
              </View>

              {/* Top Players */}
              <View style={s.card}>
                <Text style={s.cardTitle}>🏆 Top Player Balances</Text>
                {stats?.topPlayers && stats.topPlayers.length > 0 ? (
                  stats.topPlayers.map((p: any, idx: number) => (
                    <View key={p.id} style={s.row}>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, width: 24 }}>#{idx + 1}</Text>
                      <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: 'Inter_500Medium' }}>
                        {p.username}
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gold, fontFamily: 'Inter_700Bold' }}>
                        {p.coin_balance} 🪙
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.emptyText}>No player data available</Text>
                )}
              </View>
            </>
          )}

          {/* TAB 2: USERS */}
          {activeTab === 'users' && (
            <>
              {/* Search */}
              <View style={s.searchBarContainer}>
                <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search by email, username or phone..."
                  placeholderTextColor={colors.mutedForeground}
                  value={userSearch}
                  onChangeText={setUserSearch}
                  onSubmitEditing={loadUsers}
                  returnKeyType="search"
                />
                {userSearch.length > 0 && (
                  <Pressable
                    onPress={() => {
                      setUserSearch('');
                      loadUsers();
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {/* Status Filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                {['all', 'active', 'suspended', 'banned'].map((st) => (
                  <Pressable
                    key={st}
                    style={[s.filterChip, userStatusFilter === st && s.filterChipActive]}
                    onPress={() => setUserStatusFilter(st)}
                  >
                    <Text style={[s.filterChipText, userStatusFilter === st && s.filterChipTextActive]}>
                      {st.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[s.filterChip, flaggedOnly && s.filterChipActive]}
                  onPress={() => setFlaggedOnly(!flaggedOnly)}
                >
                  <Text style={[s.filterChipText, flaggedOnly && s.filterChipTextActive]}>🚩 FLAGGED ONLY</Text>
                </Pressable>
              </ScrollView>

              <View style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={s.cardTitle}>Registered Accounts ({totalUsers})</Text>
                  <Pressable onPress={loadUsers}>
                    <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                  </Pressable>
                </View>

                {usersLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
                ) : users.length === 0 ? (
                  <Text style={s.emptyText}>No users matched your criteria</Text>
                ) : (
                  users.map((u) => {
                    const badgeColor = getStatusBadgeColor(u.status);
                    return (
                      <Pressable key={u.id} style={s.userItem} onPress={() => openUserModal(u)}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.userName}>{u.username}</Text>
                            {u.is_flagged && <Text style={{ fontSize: 12 }}>🚩</Text>}
                            {u.role && u.role !== 'player' && u.role !== 'user' && (
                              <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Inter_700Bold' }}>
                                [{u.role.toUpperCase()}]
                              </Text>
                            )}
                          </View>
                          <Text style={s.userEmail}>{u.email}</Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={{ fontSize: 13, color: colors.gold, fontFamily: 'Inter_600SemiBold' }}>
                            {u.coin_balance} 🪙
                          </Text>
                          <View style={[s.badge, { backgroundColor: badgeColor + '20', borderColor: badgeColor }]}>
                            <Text style={[s.badgeText, { color: badgeColor }]}>{u.status}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </>
          )}

          {/* TAB 3: TRANSACTIONS */}
          {activeTab === 'transactions' && (
            <>
              {/* Type Filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                {['all', 'deposit', 'withdrawal', 'prize', 'fee'].map((type) => (
                  <Pressable
                    key={type}
                    style={[s.filterChip, txTypeFilter === type && s.filterChipActive]}
                    onPress={() => setTxTypeFilter(type)}
                  >
                    <Text style={[s.filterChipText, txTypeFilter === type && s.filterChipTextActive]}>
                      {type.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={s.cardTitle}>Transactions ({totalTransactions})</Text>
                  <Pressable onPress={loadTransactions}>
                    <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                  </Pressable>
                </View>

                {txLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
                ) : transactions.length === 0 ? (
                  <Text style={s.emptyText}>No transactions recorded</Text>
                ) : (
                  transactions.map((tx) => {
                    const statusColor = getStatusBadgeColor(tx.status);
                    return (
                      <View key={tx.id} style={s.userItem}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.userName}>{tx.username || `User #${tx.user_id}`}</Text>
                          <Text style={s.userEmail}>{tx.description || tx.reference}</Text>
                          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                            {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>
                            {tx.amount_ngn ? `₦${tx.amount_ngn}` : `${tx.amount_coins} 🪙`}
                          </Text>
                          <View style={[s.badge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
                            <Text style={[s.badgeText, { color: statusColor }]}>{tx.status}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </>
          )}

          {/* TAB 4: SUPPORT */}
          {activeTab === 'support' && (
            <>
              <Pressable style={s.supportCard} onPress={() => router.push('/admin/support' as any)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Ionicons name="chatbubbles-outline" size={32} color={colors.primary} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
                      Support Ticket Dashboard
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      View, assign, filter, and reply to player requests
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </View>
              </Pressable>

              <Pressable style={s.supportCard} onPress={() => router.push('/admin/support/faqs' as any)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Ionicons name="help-circle-outline" size={32} color={colors.accent} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
                      FAQ Content Management
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                      Add, edit, enable, or disable public self-service answers
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </View>
              </Pressable>
            </>
          )}

          {/* TAB 5: REPORTS & AUDIT */}
          {activeTab === 'reports' && (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Pressable
                  style={[s.filterChip, reportSubTab === 'security' && s.filterChipActive]}
                  onPress={() => setReportSubTab('security')}
                >
                  <Text style={[s.filterChipText, reportSubTab === 'security' && s.filterChipTextActive]}>
                    Security Audit Logs
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.filterChip, reportSubTab === 'referrals' && s.filterChipActive]}
                  onPress={() => setReportSubTab('referrals')}
                >
                  <Text style={[s.filterChipText, reportSubTab === 'referrals' && s.filterChipTextActive]}>
                    Referrals & Affiliates
                  </Text>
                </Pressable>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>
                  {reportSubTab === 'security' ? 'Security Events Log' : 'Recent Referral Activity'}
                </Text>

                {reportsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
                ) : reportSubTab === 'security' ? (
                  securityLogs.length === 0 ? (
                    <Text style={s.emptyText}>No security logs found</Text>
                  ) : (
                    securityLogs.map((log) => (
                      <View key={log.id} style={s.userItem}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{log.action}</Text>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                            {log.details ? JSON.stringify(log.details) : 'No details'}
                          </Text>
                          <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
                            {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                          </Text>
                        </View>
                      </View>
                    ))
                  )
                ) : referrals.length === 0 ? (
                  <Text style={s.emptyText}>No referral activity recorded</Text>
                ) : (
                  referrals.map((r) => (
                    <View key={r.id} style={s.userItem}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                          {r.referrer_username} ➔ {r.referee_username}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          Bonus Paid: {r.bonus_paid ? 'Yes' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </LinearGradient>

      {/* ── User Detail Modal ── */}
      <Modal visible={Boolean(selectedUser)} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>User Details: @{selectedUser?.username}</Text>
              <Pressable onPress={() => setSelectedUser(null)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            {userDetailLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            ) : (
              <ScrollView contentContainerStyle={s.modalBody}>
                <View style={s.row}>
                  <Text style={s.label}>User ID</Text>
                  <Text style={s.value}>#{selectedUser?.id}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Email</Text>
                  <Text style={s.value}>{selectedUser?.email}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Phone</Text>
                  <Text style={s.value}>{selectedUser?.phone || 'Not set'}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Coin Balance</Text>
                  <Text style={[s.value, { color: colors.gold }]}>{selectedUser?.coin_balance} 🪙</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Account Role</Text>
                  <Text style={s.value}>{selectedUser?.role || 'player'}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Current Status</Text>
                  <Text style={[s.value, { color: getStatusBadgeColor(selectedUser?.status) }]}>
                    {selectedUser?.status?.toUpperCase()}
                  </Text>
                </View>
                <View style={s.row}>
                  <Text style={s.label}>Flagged</Text>
                  <Text style={s.value}>{selectedUser?.is_flagged ? 'Yes 🚩' : 'No'}</Text>
                </View>

                {/* Flag reason input */}
                <Text style={[s.label, { marginTop: 8 }]}>Flag Reason / Notes</Text>
                <TextInput
                  style={[s.searchInput, { borderWidth: 1, borderColor: colors.border, borderRadius: 8 }]}
                  placeholder="Enter flag reason..."
                  placeholderTextColor={colors.mutedForeground}
                  value={flagReasonInput}
                  onChangeText={setFlagReasonInput}
                />

                <Pressable
                  style={[
                    s.actionBtn,
                    { backgroundColor: selectedUser?.is_flagged ? '#16a34a' : '#d97706', marginTop: 4 },
                  ]}
                  onPress={handleToggleFlag}
                >
                  <Text style={s.actionBtnText}>{selectedUser?.is_flagged ? 'Unflag Account' : 'Flag Account'}</Text>
                </Pressable>

                {/* Moderate Account Status */}
                <Text style={[s.label, { marginTop: 12 }]}>Change Account Status</Text>
                <View style={s.actionRow}>
                  <Pressable
                    style={[s.actionBtn, { backgroundColor: '#16a34a' }]}
                    onPress={() => handleUpdateStatus('active')}
                  >
                    <Text style={s.actionBtnText}>Active</Text>
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, { backgroundColor: '#d97706' }]}
                    onPress={() => handleUpdateStatus('suspended')}
                  >
                    <Text style={s.actionBtnText}>Suspend</Text>
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, { backgroundColor: '#dc2626' }]}
                    onPress={() => handleUpdateStatus('banned')}
                  >
                    <Text style={s.actionBtnText}>Ban</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
