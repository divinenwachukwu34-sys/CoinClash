import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { api, type TournamentDetails, type TournamentPlayer } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TournamentDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = parseInt(id, 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { coins, syncFromServer, deductCoins, addTransaction } = useWallet();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [t, setT] = useState<TournamentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getTournamentDetails(tournamentId, token);
      setT(data);
    } catch {
      Alert.alert('Error', 'Failed to load tournament');
      router.back();
    }
    setLoading(false);
  }, [tournamentId, token, router]);

  useEffect(() => { load(); }, [load]);

  // WebSocket Connection
  useEffect(() => {
    if (!token || !t) return;
    
    // Connect to WebSocket
    // Extract base URL correctly
    const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';
    const wsUrl = apiBaseUrl.replace('http', 'ws') + `/tournaments/ws/${tournamentId}`;
    
    const connectWs = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'leaderboard_update') {
            setT(prev => {
              if (!prev) return prev;
              const newBoard: TournamentPlayer[] = msg.board;
              let myNewStatus = newBoard.find(p => p.userId === user?.id) || prev.myStatus;
              return { ...prev, board: newBoard, myStatus: myNewStatus as any };
            });
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsConnected(false);
        // Attempt reconnect if still mounted
        setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [tournamentId, token, t?.id, user?.id]);

  // Countdown timer
  useEffect(() => {
    if (!t) return;
    const interval = setInterval(() => {
      const end = new Date(t.endTime).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('Ended');
        clearInterval(interval);
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [t]);

  const handleJoin = async () => {
    if (!t || !token) return;
    if (coins < t.entryFee) {
      Alert.alert('Not enough coins', `You need ${t.entryFee} coins to join this tournament.`);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setJoining(true);
    try {
      const res = await api.joinTournament(tournamentId, token);
      syncFromServer(res.newBalance);
      addTransaction({ type: 'stake', amount: t.entryFee, description: `Joined Tournament: ${t.title}` });
      await load(); // Reload to get myStatus
    } catch (e: any) {
      Alert.alert('Join Failed', e.message);
    }
    setJoining(false);
  };

  const handlePlay = () => {
    if (!t || !t.myStatus || t.myStatus.lives <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Route to the special tournament select screen
    router.push({ pathname: '/game/select', params: { tournamentId: String(tournamentId) } });
  };

  if (loading || !t) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#3B0764', colors.background]} style={s.header}>
        <View style={s.topBar}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          </Pressable>
          <View style={[s.liveBadge, { backgroundColor: wsConnected ? '#10B98120' : '#EF444420' }]}>
            <View style={[s.liveDot, { backgroundColor: wsConnected ? '#10B981' : '#EF4444' }]} />
            <Text style={[s.liveText, { color: wsConnected ? '#10B981' : '#EF4444' }]}>
              {wsConnected ? 'LIVE' : 'CONNECTING...'}
            </Text>
          </View>
        </View>

        <Text style={s.title}>{t.title}</Text>
        
        <View style={s.infoCards}>
          <View style={s.infoCard}>
            <Ionicons name="gift" size={20} color={colors.gold} />
            <View>
              <Text style={s.infoLabel}>Prize Pool</Text>
              <Text style={s.infoValue}>{t.prizePool} 🪙</Text>
            </View>
          </View>
          <View style={s.infoCard}>
            <Ionicons name="time" size={20} color={colors.accent} />
            <View>
              <Text style={s.infoLabel}>Ends In</Text>
              <Text style={s.infoValue}>{timeLeft || '...'}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Action Area */}
      <View style={s.actionArea}>
        {!t.myStatus ? (
          <View style={s.joinBox}>
            <Text style={s.joinDesc}>Join the tournament to climb the ranks and win a massive prize!</Text>
            <Pressable style={s.joinBtn} onPress={handleJoin} disabled={joining}>
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={s.joinBtnText}>Join for {t.entryFee} Coins</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={s.myStatusBox}>
            <View style={s.myStatsRow}>
              <View style={s.myStat}>
                <Text style={s.myStatLabel}>My Score</Text>
                <Text style={s.myStatVal}>{t.myStatus.score} Wins</Text>
              </View>
              <View style={s.myStatDivider} />
              <View style={s.myStat}>
                <Text style={s.myStatLabel}>My Rank</Text>
                <Text style={s.myStatVal}>#{t.myStatus.rank}</Text>
              </View>
              <View style={s.myStatDivider} />
              <View style={s.myStat}>
                <Text style={s.myStatLabel}>Lives</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                  {[1,2,3].map(i => (
                    <Ionicons key={i} name="heart" size={16} color={i <= t.myStatus!.lives ? '#EF4444' : '#4B5563'} />
                  ))}
                </View>
              </View>
            </View>

            {t.myStatus.status === 'eliminated' ? (
              <View style={s.eliminatedBanner}>
                <Text style={s.eliminatedText}>Eliminated! Wait for the final results.</Text>
              </View>
            ) : t.status === 'active' ? (
              <Pressable style={s.playBtn} onPress={handlePlay}>
                <LinearGradient colors={['#D946EF', '#9333EA']} style={s.playBtnGrad}>
                  <Text style={s.playBtnText}>PLAY MATCH</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={s.eliminatedBanner}>
                <Text style={s.eliminatedText}>Tournament is {t.status}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={s.leaderboardHeader}>
        <Text style={s.leaderboardTitle}>Live Leaderboard</Text>
        <Text style={s.leaderboardSub}>Top 50 Players</Text>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {t.board.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: 20 }}>No players yet. Be the first!</Text>
        ) : (
          t.board.map((p, i) => (
            <View key={p.userId} style={[s.row, p.isMe && s.rowMe, p.status === 'eliminated' && { opacity: 0.5 }]}>
              <Text style={[s.rank, p.rank <= 3 && { color: colors.gold }]}>#{p.rank}</Text>
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{p.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pName}>{p.username} {p.isMe && '(You)'}</Text>
                <Text style={s.pStatus}>{p.status === 'eliminated' ? 'Eliminated' : 'Active'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.pScore}>{p.score} Wins</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                  {[1,2,3].map(li => (
                    <Ionicons key={li} name="heart" size={10} color={li <= p.lives ? '#EF4444' : '#4B5563'} />
                  ))}
                </View>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 12, paddingHorizontal: 20, paddingBottom: 20 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    liveDot: { width: 8, height: 8, borderRadius: 4 },
    liveText: { fontSize: 10, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    
    title: { fontSize: 26, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold', marginBottom: 16 },
    infoCards: { flexDirection: 'row', gap: 12 },
    infoCard: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular' },
    infoValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },

    actionArea: { padding: 16 },
    joinBox: { backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.primary + '40', alignItems: 'center', gap: 12 },
    joinDesc: { fontSize: 14, color: colors.foreground, textAlign: 'center', fontFamily: 'Inter_500Medium' },
    joinBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    joinBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },

    myStatusBox: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 16 },
    myStatsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    myStat: { alignItems: 'center' },
    myStatLabel: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', marginBottom: 4 },
    myStatVal: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    myStatDivider: { width: 1, height: 30, backgroundColor: colors.border },
    
    playBtn: { borderRadius: 12, overflow: 'hidden' },
    playBtnGrad: { paddingVertical: 16, alignItems: 'center' },
    playBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    
    eliminatedBanner: { backgroundColor: colors.destructive + '20', padding: 12, borderRadius: 8, alignItems: 'center' },
    eliminatedText: { color: colors.destructive, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },

    leaderboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, marginBottom: 8 },
    leaderboardTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    leaderboardSub: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    
    list: { paddingHorizontal: 16, gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    rowMe: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
    rank: { width: 30, fontSize: 15, fontWeight: '700', color: colors.mutedForeground, fontFamily: 'Inter_700Bold' },
    avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 13, fontWeight: '700', color: colors.foreground },
    pName: { fontSize: 15, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    pStatus: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    pScore: { fontSize: 15, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
  });
}
