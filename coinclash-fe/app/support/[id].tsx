import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, SupportMessage, SupportTicketDetail } from '@/lib/api';

export default function UserTicketDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = parseInt(id ?? '0', 10);
  const { token, user } = useAuth();

  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTicket = useCallback(async (silent = false) => {
    if (!token || !ticketId) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.getTicketDetail(ticketId, token);
      setTicket(res.ticket);
    } catch (err: any) {
      if (!silent) {
        Alert.alert('Error', err.message || 'Unable to load ticket details.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, ticketId]);

  useEffect(() => {
    fetchTicket();

    // Short-polling every 3.5 seconds while viewing active ticket
    pollIntervalRef.current = setInterval(() => {
      fetchTicket(true);
    }, 3500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchTicket]);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    if (!token || !ticketId) return;

    setSending(true);
    try {
      const res = await api.sendTicketMessage(ticketId, replyText.trim(), attachmentBase64 || undefined, token);
      if (res.success) {
        setReplyText('');
        setAttachmentBase64(null);
        fetchTicket(true);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = () => {
    Alert.alert(
      'Close Ticket?',
      'Are you sure you want to mark this support ticket as closed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Ticket',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await api.closeTicket(ticketId, token);
              fetchTicket(true);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to close ticket.');
            }
          },
        },
      ]
    );
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0] && result.assets[0].base64) {
        const mime = result.assets[0].uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const dataUri = `data:${mime};base64,${result.assets[0].base64}`;
        if (dataUri.length > 2_900_000) {
          Alert.alert('File Too Large', 'Screenshot size must be under 2MB.');
          return;
        }
        setAttachmentBase64(dataUri);
      }
    } catch {}
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
    header: { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 14 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    ticketBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ticketNum: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    subjectText: { fontSize: 15, color: colors.foreground, fontFamily: 'Inter_600SemiBold', marginTop: 4 },

    // Related Tx Card
    txCard: {
      backgroundColor: colors.card,
      marginHorizontal: 20,
      marginVertical: 10,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary + '50',
      gap: 4,
    },
    txTitle: { fontSize: 11, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
    txDesc: { fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    txMeta: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },

    // Messages
    chatContent: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
    messageBubble: {
      maxWidth: '82%',
      borderRadius: 16,
      padding: 14,
      gap: 6,
    },
    userBubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    adminBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    senderLabel: { fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
    messageText: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
    timeText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', alignSelf: 'flex-end', marginTop: 2 },
    msgImage: { width: 180, height: 140, borderRadius: 10, marginTop: 6 },

    // Bottom Reply Bar
    replyBar: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 14,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    replyInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    replyInput: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: colors.foreground,
      fontSize: 14,
      maxHeight: 100,
      fontFamily: 'Inter_400Regular',
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closedNotice: {
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    closedText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
  });

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>Loading ticket...</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Text style={{ color: colors.foreground, fontSize: 16 }}>Ticket not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 14 }}>
          <Text style={{ color: colors.primary }}>Return to Customer Care</Text>
        </Pressable>
      </View>
    );
  }

  const isClosed = ticket.status === 'CLOSED';
  const statusColor = getStatusColor(ticket.status);

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Tickets</Text>
          </Pressable>

          <View style={s.ticketBar}>
            <Text style={s.ticketNum}>{ticket.ticket_number}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
                <Text style={[s.statusText, { color: statusColor }]}>{ticket.status}</Text>
              </View>

              {!isClosed && (
                <Pressable onPress={handleCloseTicket}>
                  <Ionicons name="close-circle-outline" size={24} color={colors.destructive} />
                </Pressable>
              )}
            </View>
          </View>
          <Text style={s.subjectText}>{ticket.subject}</Text>
        </View>

        {/* Attached Transaction Info */}
        {ticket.related_transaction && (
          <View style={s.txCard}>
            <Text style={s.txTitle}>🔗 Attached Transaction</Text>
            <Text style={s.txDesc}>{ticket.related_transaction.description}</Text>
            <Text style={s.txMeta}>
              Ref: {ticket.related_transaction.reference || `TX-${ticket.related_transaction.id}`} • Status: {ticket.related_transaction.status}
            </Text>
          </View>
        )}

        {/* Conversation Message List */}
        <FlatList
          data={ticket.messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.chatContent}
          renderItem={({ item: m }) => {
            const isUser = m.sender_type === 'USER';
            return (
              <View style={[s.messageBubble, isUser ? s.userBubble : s.adminBubble]}>
                <Text style={[s.senderLabel, { color: isUser ? '#FFFFFF' : colors.gold }]}>
                  {isUser ? 'YOU' : 'COINCLASH SUPPORT'}
                </Text>

                <Text style={[s.messageText, { color: isUser ? '#FFFFFF' : colors.foreground }]}>
                  {m.message}
                </Text>

                {m.attachment_url && (
                  <Image source={{ uri: m.attachment_url }} style={s.msgImage} resizeMode="cover" />
                )}

                <Text style={[s.timeText, !isUser && { color: colors.mutedForeground }]}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        {/* Reply Input Bar */}
        {isClosed ? (
          <View style={s.closedNotice}>
            <Text style={s.closedText}>🔒 This ticket is closed.</Text>
          </View>
        ) : (
          <View style={s.replyBar}>
            {attachmentBase64 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Image source={{ uri: attachmentBase64 }} style={{ width: 36, height: 36, borderRadius: 6 }} />
                <Text style={{ fontSize: 12, color: colors.accent }}>Image Attached</Text>
                <Pressable onPress={() => setAttachmentBase64(null)} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close" size={18} color={colors.destructive} />
                </Pressable>
              </View>
            )}

            <View style={s.replyInputRow}>
              <Pressable onPress={handlePickImage}>
                <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
              </Pressable>

              <TextInput
                style={s.replyInput}
                placeholder="Type your message..."
                placeholderTextColor={colors.mutedForeground}
                value={replyText}
                onChangeText={setReplyText}
                multiline
              />

              <Pressable
                style={[s.sendBtn, !replyText.trim() && { opacity: 0.5 }]}
                onPress={handleSendReply}
                disabled={!replyText.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}
