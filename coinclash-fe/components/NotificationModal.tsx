import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useNotifications } from '@/context/NotificationContext';
import { NotificationItem } from '@/lib/api';
import * as Haptics from 'expo-haptics';

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
}

function getIconForType(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case 'welcome':
      return { name: 'sparkles', color: '#F59E0B' };
    case 'bonus':
      return { name: 'gift', color: '#EC4899' };
    case 'deposit':
    case 'bank':
      return { name: 'wallet', color: '#10B981' };
    case 'tournament':
      return { name: 'trophy', color: '#9333EA' };
    case 'match':
      return { name: 'flash', color: '#3B82F6' };
    case 'referral':
      return { name: 'people', color: '#14B8A6' };
    default:
      return { name: 'notifications', color: '#6366F1' };
  }
}

function formatRelTime(dateStr?: string): string {
  if (!dateStr) return 'Just now';
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return 'Just now';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ visible, onClose }) => {
  const colors = useColors();
  const { notifications, unreadCount, markAllAsRead, clearAllNotifications } = useNotifications();

  const handleMarkAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markAllAsRead();
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearAllNotifications();
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '82%',
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
    },
    unreadBadge: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    unreadText: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.muted + '40',
      alignItems: 'center',
      justify: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.primary,
      fontFamily: 'Inter_600SemiBold',
    },
    clearText: {
      color: colors.destructive,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    notifItem: {
      flexDirection: 'row',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unreadItem: {
      borderColor: colors.primary + '60',
      backgroundColor: colors.primary + '08',
    },
    iconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justify: 'center',
    },
    textContainer: {
      flex: 1,
      gap: 4,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
    },
    itemMessage: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      lineHeight: 18,
    },
    itemTime: {
      fontSize: 11,
      color: colors.mutedForeground + 'A0',
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    emptyState: {
      paddingVertical: 48,
      alignItems: 'center',
      justify: 'center',
      gap: 12,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.foreground,
      fontFamily: 'Inter_700Bold',
    },
    emptySub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      paddingHorizontal: 40,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="notifications" size={22} color={colors.primary} />
              <Text style={styles.title}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount} new</Text>
                </View>
              )}
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Action Row */}
          {notifications.length > 0 && (
            <View style={styles.actionsRow}>
              <Pressable onPress={handleMarkAll}>
                <Text style={styles.actionBtnText}>Mark all as read</Text>
              </Pressable>
              <Pressable onPress={handleClear}>
                <Text style={[styles.actionBtnText, styles.clearText]}>Clear all</Text>
              </Pressable>
            </View>
          )}

          {/* List */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="bell-off-outline" size={56} color={colors.mutedForeground} />
                <Text style={styles.emptyTitle}>No Notifications Yet</Text>
                <Text style={styles.emptySub}>
                  You're all caught up! Updates about deposits, tournaments, and bonuses will appear here.
                </Text>
              </View>
            ) : (
              notifications.map((item) => {
                const icon = getIconForType(item.type);
                return (
                  <View
                    key={item.id}
                    style={[styles.notifItem, !item.is_read && styles.unreadItem]}
                  >
                    <View style={[styles.iconBox, { backgroundColor: icon.color + '20' }]}>
                      <Ionicons name={icon.name} size={22} color={icon.color} />
                    </View>
                    <View style={styles.textContainer}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemMessage}>{item.message}</Text>
                      <Text style={styles.itemTime}>{formatRelTime(item.created_at)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
