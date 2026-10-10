import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { api, SupportTicket } from '@/lib/api';

const ADMIN_EMAIL = 'admin@coinclash.com';

const STATUSES = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['ALL', 'LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function AdminSupportDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token, authLoading } = useAuth();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, resolved: 0, closed: 0 });
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Admin Guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/(auth)/login'); return; }
    if (!user.isAdmin && user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user, authLoading]);

  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getAdminTickets(token, {
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        priority: selectedPriority === 'ALL' ? undefined : selectedPriority,
        search: searchQuery.trim() || undefined,
      });
      setTickets(res.tickets || []);
      setCounts(res.counts || { open: 0, in_progress: 0, resolved: 0, closed: 0 });
    } catch (err) {
      console.warn('Error fetching admin tickets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedStatus, selectedPriority, searchQuery]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return colors.gold;
      case 'IN_PROGRESS': return colors.primary;
      case 'RESOLVED': return colors.accent;
      case 'CLOSED': return colors.mutedForeground;
      default: return colors.mutedForeground;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return colors.destructive;
      case 'HIGH': return colors.gold;
      case 'NORMAL': return colors.primary;
      case 'LOW': return colors.mutedForeground;
      default: return colors.mutedForeground;
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    faqBtn: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    faqBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary, fontFamily: 'Inter_600SemiBold' },

    // Count Stat Cards
    statGrid: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      gap: 8,
      marginVertical: 10,
    },
    statBox: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      alignItems: 'center',
    },
    statNum: { fontSize: 18, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    statLbl: { fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },

    // Search Bar
    searchContainer: { paddingHorizontal: 20, marginBottom: 10 },
    searchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    searchInput: { flex: 1, color: colors.foreground, fontSize: 14, fontFamily: 'Inter_400Regular' },

    // Filter Pills
    filterRow: { paddingHorizontal: 20, gap: 6, paddingBottom: 10 },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillText: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
    pillTextActive: { color: '#FFFFFF' },

    // Ticket list
    listContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
    ticketCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ticketNum: { fontSize: 14, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    tagGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
    badgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    subjectText: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    userInfo: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    categoryText: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    unreadBadge: {
      backgroundColor: colors.destructive,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
    },
    unreadText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700', fontFamily: 'Inter_700Bold' },

    emptyCard: { padding: 40, alignItems: 'center', gap: 8 },
    emptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Admin Panel</Text>
          </Pressable>

          <View style={s.topRow}>
            <Text style={s.title}>🛡️ Support Dashboard</Text>
            <Pressable style={s.faqBtn} onPress={() => router.push('/admin/support/faqs')}>
              <Ionicons name="help-circle" size={16} color={colors.primary} />
              <Text style={s.faqBtnText}>FAQs</Text>
            </Pressable>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={s.statGrid}>
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: colors.gold }]}>{counts.open}</Text>
            <Text style={s.statLbl}>Open</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: colors.primary }]}>{counts.in_progress}</Text>
            <Text style={s.statLbl}>In Progress</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: colors.accent }]}>{counts.resolved}</Text>
            <Text style={s.statLbl}>Resolved</Text>
          </View>
          <View style={s.statBox}>
            <Text style={[s.statNum, { color: colors.mutedForeground }]}>{counts.closed}</Text>
            <Text style={s.statLbl}>Closed</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={s.searchContainer}>
          <View style={s.searchCard}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={s.searchInput}
              placeholder="Search #CC-XXXXX, user, subject..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Status Filter Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUSES}
          keyExtractor={(st) => st}
          contentContainerStyle={s.filterRow}
          renderItem={({ item: st }) => {
            const isActive = selectedStatus === st;
            return (
              <Pressable
                style={[s.pill, isActive && s.pillActive]}
                onPress={() => setSelectedStatus(st)}
              >
                <Text style={[s.pillText, isActive && s.pillTextActive]}>{st}</Text>
              </Pressable>
            );
          }}
        />

        {/* Priority Filter Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={PRIORITIES}
          keyExtractor={(pr) => pr}
          contentContainerStyle={s.filterRow}
          renderItem={({ item: pr }) => {
            const isActive = selectedPriority === pr;
            return (
              <Pressable
                style={[s.pill, isActive && s.pillActive]}
                onPress={() => setSelectedPriority(pr)}
              >
                <Text style={[s.pillText, isActive && s.pillTextActive]}>Priority: {pr}</Text>
              </Pressable>
            );
          }}
        />

        {/* Ticket List */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={(t) => String(t.id)}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={s.emptyCard}>
                <Ionicons name="folder-open-outline" size={36} color={colors.mutedForeground} />
                <Text style={s.emptyText}>No support tickets found.</Text>
              </View>
            }
            renderItem={({ item: t }) => {
              const statusColor = getStatusColor(t.status);
              const priorityColor = getPriorityColor(t.priority);
              const unreadCount = t.unread_user_count ?? 0;

              return (
                <Pressable
                  style={[s.ticketCard, unreadCount > 0 && { borderColor: colors.primary, borderWidth: 1.5 }]}
                  onPress={() => router.push(`/admin/support/${t.id}`)}
                >
                  <View style={s.ticketHeader}>
                    <Text style={s.ticketNum}>{t.ticket_number}</Text>

                    <View style={s.tagGroup}>
                      {unreadCount > 0 && (
                        <View style={s.unreadBadge}>
                          <Text style={s.unreadText}>{unreadCount} NEW</Text>
                        </View>
                      )}

                      <View style={[s.badge, { backgroundColor: priorityColor + '20', borderColor: priorityColor }]}>
                        <Text style={[s.badgeText, { color: priorityColor }]}>{t.priority}</Text>
                      </View>

                      <View style={[s.badge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
                        <Text style={[s.badgeText, { color: statusColor }]}>{t.status}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={s.subjectText} numberOfLines={1}>{t.subject}</Text>
                  <Text style={s.userInfo}>User: {t.username || `User #${t.user_id}`} ({t.email})</Text>

                  <View style={s.metaRow}>
                    <Text style={s.categoryText}>{t.category}</Text>
                    <Text style={s.categoryText}>{new Date(t.updated_at).toLocaleDateString()}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </LinearGradient>
    </View>
  );
}
