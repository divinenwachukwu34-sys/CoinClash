import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface MatchmakingModalProps {
  visible: boolean;
  gameTitle: string;
  stake: number;
  searchSeconds: number;
  onCancel: () => void;
  onPlayBot: () => void;
}

export function MatchmakingModal({
  visible,
  gameTitle,
  stake,
  searchSeconds,
  onCancel,
  onPlayBot,
}: MatchmakingModalProps) {
  const colors = useColors();

  if (!visible) return null;

  const showBotOption = searchSeconds >= 8;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={s.radarContainer}>
            <View style={[s.pulseCircle, { borderColor: colors.primary + '50' }]}>
              <View style={[s.innerCircle, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="game-controller" size={32} color={colors.primary} />
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
                You can duel a calibrated Medium AI bot now or continue searching for real players.
              </Text>
              <Pressable style={s.botBtn} onPress={onPlayBot}>
                <LinearGradient colors={['#D97706', '#B45309']} style={s.botBtnInner}>
                  <Text style={s.botBtnText}>Play Medium Bot Now</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* Cancel */}
          <Pressable style={s.cancelBtn} onPress={onCancel}>
            <Text style={[s.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 15, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
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
});
