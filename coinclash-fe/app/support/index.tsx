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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, SupportTicket } from '@/lib/api';

const POPULAR_TOPICS = [
  { id: 'Payments & Deposits', name: 'Payments & Deposits', icon: 'card-outline' },
  { id: 'Withdrawals', name: 'Withdrawals', icon: 'cash-outline' },
  { id: 'Transactions', name: 'Transactions', icon: 'swap-horizontal-outline' },
  { id: 'Matchmaking & Games', name: 'Matchmaking & Games', icon: 'game-controller-outline' },
  { id: 'Scores & Results', name: 'Scores & Results', icon: 'trophy-outline' },
  { id: 'Account & Security', name: 'Account & Security', icon: 'shield-checkmark-outline' },
  { id: 'OTP', name: 'OTP Verification', icon: 'key-outline' },
  { id: 'Technical Problems', name: 'Technical Problems', icon: 'build-outline' },
];

export default function SupportHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getUserTickets(token);
      setTickets(res.tickets || []);
    } catch (err) {
      console.warn('Error fetching tickets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const handleSearchSubmit = () => {
    router.push({
      pathname: '/support/faqs',
      params: { q: searchQuery.trim() },
    });
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

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
    content: { padding: 20, paddingBottom: 100, gap: 20 },
    
    // Search Box
    searchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },

    // Section title
    sectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.mutedForeground,
      fontFamily: 'Inter_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },

    // Grid
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    topicCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      alignItems: 'center',
      gap: 8,
    },
    topicText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
      textAlign: 'center',
    },

    // Big Chat Button
    chatBtn: {
      borderRadius: 16,
      overflow: 'hidden',
      marginVertical: 4,
    },
    chatBtnInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 10,
    },
    chatBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },

    // Ticket list
    ticketCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 10,
      gap: 8,
    },
    ticketHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    ticketNum: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
      fontFamily: 'Inter_700Bold',
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
      fontFamily: 'Inter_700Bold',
    },
    ticketSubject: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    ticketMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },
    ticketCategory: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    ticketDate: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.destructive,
    },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Profile</Text>
          </Pressable>
          <Text style={s.title}>🎧 Customer Care</Text>
          <Text style={s.subtitle}>How can we help you today?</Text>
        </View>

        <FlatList
          data={[{ key: 'content' }]}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          renderItem={() => (
            <View style={s.content}>
              {/* Search Help Center */}
              <View style={s.searchCard}>
                <Ionicons name="search" size={20} color={colors.mutedForeground} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search Help Center..."
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearchSubmit}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={handleSearchSubmit}>
                    <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
                  </Pressable>
                )}
              </View>

              {/* Popular Topics Grid */}
              <View>
                <Text style={s.sectionTitle}>Popular Help Topics</Text>
                <View style={s.grid}>
                  {POPULAR_TOPICS.map((topic) => (
                    <Pressable
                      key={topic.id}
                      style={s.topicCard}
                      onPress={() =>
                        router.push({
                          pathname: '/support/faqs',
                          params: { category: topic.id },
                        })
                      }
                    >
                      <Ionicons name={topic.icon as any} size={24} color={colors.primary} />
                      <Text style={s.topicText} numberOfLines={1}>
                        {topic.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Create Ticket Button */}
              <Pressable style={s.chatBtn} onPress={() => router.push('/support/create')}>
                <LinearGradient colors={['#7C3AED', '#5B21B6']} style={s.chatBtnInner}>
                  <Ionicons name="chatbubbles" size={22} color="#FFFFFF" />
                  <Text style={s.chatBtnText}>Chat with CoinClash Support</Text>
                </LinearGradient>
              </Pressable>

              {/* My Support Requests */}
              <View>
                <Text style={s.sectionTitle}>My Support Requests</Text>

                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                ) : tickets.length === 0 ? (
                  <View style={s.emptyCard}>
                    <Ionicons name="folder-open-outline" size={32} color={colors.mutedForeground} />
                    <Text style={s.emptyText}>You don't have any support requests yet.</Text>
                  </View>
                ) : (
                  tickets.map((t) => {
                    const statusColor = getStatusColor(t.status);
                    const hasUnread = (t.unread_admin_count ?? 0) > 0;
                    return (
                      <Pressable
                        key={t.id}
                        style={[
                          s.ticketCard,
                          hasUnread && { borderColor: colors.primary, borderWidth: 1.5 },
                        ]}
                        onPress={() => router.push(`/support/${t.id}`)}
                      >
                        <View style={s.ticketHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={s.ticketNum}>{t.ticket_number}</Text>
                            {hasUnread && <View style={s.unreadDot} />}
                          </View>
                          <View
                            style={[
                              s.statusBadge,
                              { backgroundColor: statusColor + '20', borderColor: statusColor },
                            ]}
                          >
                            <Text style={[s.statusText, { color: statusColor }]}>{t.status}</Text>
                          </View>
                        </View>

                        <Text style={s.ticketSubject} numberOfLines={1}>
                          {t.subject}
                        </Text>

                        <View style={s.ticketMeta}>
                          <Text style={s.ticketCategory}>{t.category}</Text>
                          <Text style={s.ticketDate}>
                            {new Date(t.updated_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          )}
        />
      </LinearGradient>
    </View>
  );
}
