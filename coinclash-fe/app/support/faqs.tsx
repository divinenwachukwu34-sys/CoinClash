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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, SupportFaq } from '@/lib/api';

const CATEGORIES = [
  'All',
  'Payments & Deposits',
  'Withdrawals',
  'Transactions',
  'Matchmaking & Games',
  'Scores & Results',
  'Account & Security',
  'OTP',
  'Technical Problems',
];

export default function FaqScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const { token } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<string>(params.category || 'All');
  const [searchQuery, setSearchQuery] = useState<string>(params.q || '');
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFaqs = useCallback(async () => {
    try {
      const catParam = selectedCategory === 'All' ? undefined : selectedCategory;
      const res = await api.getFaqs(token || undefined, catParam, searchQuery.trim() || undefined);
      setFaqs(res.faqs || []);
    } catch (err) {
      console.warn('Error fetching FAQs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedCategory, searchQuery]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFaqs();
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    title: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
    
    // Search Box
    searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
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

    // Category pills horizontal scroll
    pillsContainer: { paddingHorizontal: 20, gap: 8, paddingBottom: 14 },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    pillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
    },
    pillTextActive: {
      color: '#FFFFFF',
    },

    // FAQ List
    listContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
    faqCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      gap: 10,
    },
    faqQuestion: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    faqCategoryTag: {
      fontSize: 11,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 4,
    },
    faqBody: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border + '60',
    },
    faqAnswer: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
    },

    // Footer CTA
    footerCta: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: 'center',
      marginTop: 20,
      gap: 10,
    },
    footerTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    footerBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
    },
    footerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13, fontFamily: 'Inter_700Bold' },

    emptyCard: { padding: 30, alignItems: 'center', gap: 8 },
    emptyText: { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </Pressable>
          <Text style={s.title}>❓ Help Center FAQs</Text>
          <Text style={s.subtitle}>Instant answers to common questions</Text>
        </View>

        {/* Search */}
        <View style={s.searchContainer}>
          <View style={s.searchCard}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={s.searchInput}
              placeholder="Search questions or keywords..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Category Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(cat) => cat}
          contentContainerStyle={s.pillsContainer}
          renderItem={({ item: cat }) => {
            const isActive = selectedCategory === cat;
            return (
              <Pressable
                style={[s.pill, isActive && s.pillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[s.pillText, isActive && s.pillTextActive]}>{cat}</Text>
              </Pressable>
            );
          }}
        />

        {/* FAQ Accordion List */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={faqs}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ListEmptyComponent={
              <View style={s.emptyCard}>
                <Ionicons name="help-circle-outline" size={36} color={colors.mutedForeground} />
                <Text style={s.emptyText}>No matching FAQ found.</Text>
              </View>
            }
            ListFooterComponent={
              <View style={s.footerCta}>
                <Text style={s.footerTitle}>Still need help?</Text>
                <Pressable style={s.footerBtn} onPress={() => router.push('/support/create')}>
                  <Text style={s.footerBtnText}>Create Support Ticket</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => {
              const isExpanded = expandedId === item.id;
              return (
                <View style={s.faqCard}>
                  <Pressable style={s.faqHeader} onPress={() => toggleExpand(item.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.faqCategoryTag}>{item.category}</Text>
                      <Text style={s.faqQuestion}>{item.question}</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                  {isExpanded && (
                    <View style={s.faqBody}>
                      <Text style={s.faqAnswer}>{item.answer}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </LinearGradient>
    </View>
  );
}
