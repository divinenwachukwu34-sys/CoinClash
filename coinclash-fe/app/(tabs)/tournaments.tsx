import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { api, type Tournament } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TournamentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (!token) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await api.getTournaments(token);
      setTournaments(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#2A0A3A', colors.background]} style={s.header}>
        <Text style={s.title}>Tournaments</Text>
        <Text style={s.subtitle}>Compete in massive survival runs for huge prizes</Text>
      </LinearGradient>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          {tournaments.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏳️</Text>
              <Text style={s.emptyTitle}>No Tournaments Active</Text>
              <Text style={s.emptyDesc}>Check back soon for upcoming daily and weekly events.</Text>
            </View>
          ) : (
            tournaments.map((t) => {
              const isWeekly = t.type === 'weekly';
              return (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [
                    s.card,
                    { transform: [{ scale: pressed ? 0.98 : 1 }] }
                  ]}
                  onPress={() => router.push(`/tournament/${t.id}`)}
                >
                  <LinearGradient
                    colors={isWeekly ? ['#3B0764', '#1F1F3A'] : ['#0F4C81', '#1A1A3A']}
                    style={s.cardGrad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={s.cardTop}>
                      <View style={[s.badge, { backgroundColor: isWeekly ? '#D946EF20' : '#3B82F620' }]}>
                        <Text style={[s.badgeText, { color: isWeekly ? '#D946EF' : '#3B82F6' }]}>
                          {isWeekly ? 'WEEKLY' : 'DAILY'}
                        </Text>
                      </View>
                      <View style={s.statusBadge}>
                        <View style={[s.dot, { backgroundColor: t.status === 'active' ? '#10B981' : '#F59E0B' }]} />
                        <Text style={s.statusText}>{t.status.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={s.cardTitle}>{t.title}</Text>
                    
                    <View style={s.statsRow}>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Prize Pool</Text>
                        <Text style={[s.statVal, { color: colors.gold }]}>{t.prizePool} 🪙</Text>
                      </View>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Entry Fee</Text>
                        <Text style={s.statVal}>{t.entryFee} 🪙</Text>
                      </View>
                      <View style={s.statBox}>
                        <Text style={s.statLabel}>Players</Text>
                        <Text style={s.statVal}>{t.participants} 👤</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Pressable>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { padding: 16, gap: 16 },
    
    card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    cardGrad: { padding: 20, gap: 16 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 11, color: '#fff', fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
    cardTitle: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    
    statsRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, justifyContent: 'space-between' },
    statBox: { alignItems: 'center', flex: 1 },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'Inter_400Regular' },
    statVal: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    
    empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    emptyDesc: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  });
}
