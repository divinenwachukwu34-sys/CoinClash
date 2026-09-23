import { useColors } from '@/hooks/useColors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TournamentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#2A0A3A', colors.background]} style={s.header}>
        <Text style={s.title}>Tournaments</Text>
        <Text style={s.subtitle}>Compete in massive survival runs for huge prizes</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.comingSoonCard}>
          <LinearGradient
            colors={['#3B0764', '#1E1B4B', '#0D0826']}
            style={s.cardGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={s.iconWrapper}>
              <MaterialCommunityIcons name="trophy-award" size={56} color={colors.gold} />
            </View>

            <View style={s.badge}>
              <Text style={s.badgeText}>🚀 COMING SOON</Text>
            </View>

            <Text style={s.cardTitle}>Tournament Arena</Text>
            <Text style={s.cardDesc}>
              Daily & Weekly multi-round survival tournaments with huge prize pools are currently being calibrated for maximum competitive excitement.
            </Text>

            <View style={s.featureGrid}>
              <View style={s.featureItem}>
                <Ionicons name="flash" size={18} color="#F59E0B" />
                <Text style={s.featureText}>64-Player Knockout Brackets</Text>
              </View>
              <View style={s.featureItem}>
                <Ionicons name="gift" size={18} color={colors.accent} />
                <Text style={s.featureText}>Massive Coin Prize Pools</Text>
              </View>
              <View style={s.featureItem}>
                <Ionicons name="ribbon" size={18} color={colors.primary} />
                <Text style={s.featureText}>Exclusive Winner Badges & Trophies</Text>
              </View>
            </View>

            <Pressable
              style={s.actionBtn}
              onPress={() => router.push('/(tabs)/lobby')}
            >
              <LinearGradient colors={[colors.primary, '#4F1ADE']} style={s.actionBtnInner}>
                <Text style={s.actionBtnText}>Play 1v1 Clashes in Lobby</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 24, gap: 6 },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    scroll: { padding: 20, alignItems: 'center' },

    comingSoonCard: {
      width: '100%',
      maxWidth: 500,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardGrad: {
      padding: 24,
      alignItems: 'center',
      gap: 16,
    },
    iconWrapper: {
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: 'rgba(245, 158, 11, 0.15)',
      borderWidth: 2,
      borderColor: 'rgba(245, 158, 11, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    badge: {
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#F59E0B60',
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#F59E0B',
      fontFamily: 'Inter_700Bold',
      letterSpacing: 1,
    },
    cardTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
    },
    cardDesc: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 10,
    },
    featureGrid: {
      width: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: 16,
      padding: 16,
      gap: 12,
      marginVertical: 4,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    featureText: {
      fontSize: 13,
      color: '#FFFFFF',
      fontFamily: 'Inter_500Medium',
    },
    actionBtn: {
      width: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      marginTop: 8,
    },
    actionBtnInner: {
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },
  });
}
