import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface MatchmakingModalProps {
  visible: boolean;
  gameTitle: string;
  stake: number;
  searchSeconds: number;
  playerUsername?: string;
  opponentUsername?: string;
  isMatched?: boolean;
  onCancel: () => void;
  onPlayBot: () => void;
}

export function MatchmakingModal({
  visible,
  gameTitle,
  stake,
  searchSeconds,
  playerUsername = 'You',
  opponentUsername = 'Opponent',
  isMatched = false,
  onCancel,
  onPlayBot,
}: MatchmakingModalProps) {
  const colors = useColors();
  const showBotOption = searchSeconds >= 8 && !isMatched;

  // Animations for VS Clash
  const p1Anim = useRef(new Animated.Value(-120)).current;
  const p2Anim = useRef(new Animated.Value(120)).current;
  const vsScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isMatched) {
      Animated.parallel([
        Animated.spring(p1Anim, { toValue: 0, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.spring(p2Anim, { toValue: 0, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(150),
          Animated.spring(vsScaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      p1Anim.setValue(-120);
      p2Anim.setValue(120);
      vsScaleAnim.setValue(0);
    }
  }, [isMatched]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isMatched ? (
            /* ── MATCH FOUND: EPIC VS CLASH BANNER ── */
            <View style={s.clashContainer}>
              <View style={s.clashHeader}>
                <View style={s.clashBadge}>
                  <Text style={s.clashBadgeText}>⚔️ OPPONENT MATCHED!</Text>
                </View>
                <Text style={[s.subtitle, { color: colors.mutedForeground, marginTop: 4 }]}>
                  {gameTitle} • {stake > 0 ? `${stake} Coins Stake` : 'Practice'}
                </Text>
              </View>

              {/* 1v1 Battle Roster */}
              <View style={s.rosterRow}>
                {/* Player 1 Card */}
                <Animated.View style={[s.playerCard, { transform: [{ translateX: p1Anim }] }]}>
                  <LinearGradient colors={['#1E1B4B', '#312E81']} style={s.playerCardInner}>
                    <View style={[s.avatarCircle, { backgroundColor: colors.primary + '40', borderColor: colors.primary }]}>
                      <Ionicons name="person" size={26} color="#FFFFFF" />
                    </View>
                    <Text style={s.playerName} numberOfLines={1}>
                      {playerUsername}
                    </Text>
                    <Text style={s.playerLabel}>YOU</Text>
                  </LinearGradient>
                </Animated.View>

                {/* Center Swords VS Badge */}
                <Animated.View style={[s.vsCenterBadge, { transform: [{ scale: vsScaleAnim }] }]}>
                  <LinearGradient colors={['#DC2626', '#991B1B']} style={s.vsInner}>
                    <MaterialCommunityIcons name="sword-cross" size={24} color="#FFFFFF" />
                    <Text style={s.vsText}>VS</Text>
                  </LinearGradient>
                </Animated.View>

                {/* Player 2 Card */}
                <Animated.View style={[s.playerCard, { transform: [{ translateX: p2Anim }] }]}>
                  <LinearGradient colors={['#450A0A', '#7F1D1D']} style={s.playerCardInner}>
                    <View style={[s.avatarCircle, { backgroundColor: '#EF444440', borderColor: '#EF4444' }]}>
                      <Ionicons name="skull" size={26} color="#FFFFFF" />
                    </View>
                    <Text style={s.playerName} numberOfLines={1}>
                      {opponentUsername}
                    </Text>
                    <Text style={[s.playerLabel, { color: '#FCA5A5' }]}>CHALLENGER</Text>
                  </LinearGradient>
                </Animated.View>
              </View>

              <View style={s.startingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[s.startingText, { color: colors.foreground }]}>Starting Duel in 3...</Text>
              </View>
            </View>
          ) : (
            /* ── SEARCHING RADAR STATE ── */
            <>
              <View style={s.radarContainer}>
                <View style={[s.pulseCircle, { borderColor: colors.primary + '50' }]}>
                  <View style={[s.innerCircle, { backgroundColor: colors.primary + '20' }]}>
                    <MaterialCommunityIcons name="sword-cross" size={34} color={colors.primary} />
                  </View>
                </View>
              </View>

              <Text style={[s.title, { color: colors.foreground }]}>Finding Live Opponent</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
                {gameTitle} • {stake > 0 ? `${stake} Coins Stake` : 'Practice'}
              </Text>

              {/* Timer & Spinner */}
              <View style={s.timerRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[s.timerText, { color: colors.foreground }]}>
                  Searching: {searchSeconds}s
                </Text>
              </View>

              {/* Bot Fallback Prompt */}
              {showBotOption && (
                <View style={[s.botCard, { backgroundColor: colors.gold + '15', borderColor: colors.gold + '30' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="robot" size={18} color={colors.gold} />
                    <Text style={[s.botTitle, { color: colors.gold }]}>Taking a while?</Text>
                  </View>
                  <Text style={[s.botDesc, { color: colors.mutedForeground }]}>
                    Duel an AI bot instantly or continue searching for real players.
                  </Text>
                  <Pressable style={s.botBtn} onPress={onPlayBot}>
                    <LinearGradient colors={['#D97706', '#B45309']} style={s.botBtnInner}>
                      <Text style={s.botBtnText}>PLAY WITH BOT</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}

              {/* Cancel */}
              <Pressable style={s.cancelBtn} onPress={onCancel}>
                <Text style={[s.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 15, 0.90)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  radarContainer: {
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  botCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  botTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  botDesc: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
  },
  botBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 4,
  },
  botBtnInner: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },

  // ─── Epic VS Roster Styles ──────────────────────────────────────────
  clashContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  clashHeader: {
    alignItems: 'center',
  },
  clashBadge: {
    backgroundColor: '#DC262625',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DC262650',
  },
  clashBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 10,
    position: 'relative',
  },
  playerCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  playerCardInner: {
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  playerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
  },
  vsCenterBadge: {
    position: 'absolute',
    zIndex: 10,
    width: 54,
    height: 54,
    borderRadius: 27,
    elevation: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  vsInner: {
    width: '100%',
    height: '100%',
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  vsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Inter_700Bold',
    marginTop: -2,
  },
  startingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  startingText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});
