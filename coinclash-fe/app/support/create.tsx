import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, ProfileData } from '@/lib/api';

const CATEGORIES = [
  'Payments & Deposits',
  'Withdrawals',
  'Transactions',
  'Matchmaking & Games',
  'Scores & Results',
  'Account & Security',
  'OTP',
  'Technical Problems',
  'General',
];

export default function CreateTicketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Related transaction selector state
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);

  // Screenshot image attachment state
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);

  // Fetch user transactions for selector
  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setLoadingTx(true);
    try {
      const data: ProfileData = await api.getProfile(token);
      setTransactions(data.recentTransactions || []);
    } catch (err) {
      console.warn('Could not load user transactions:', err);
    } finally {
      setLoadingTx(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Image attachment handler (Base64 < 2MB image validation)
  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Permission to access media library is required to attach screenshots.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          Alert.alert('Error', 'Could not process image.');
          return;
        }

        const mime = asset.type === 'image' ? (asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg') : 'image/jpeg';
        const dataUri = `data:${mime};base64,${asset.base64}`;

        if (dataUri.length > 2_900_000) {
          Alert.alert('File Too Large', 'Screenshot size must be under 2MB.');
          return;
        }

        setAttachmentBase64(dataUri);
      }
    } catch (err: any) {
      Alert.alert('Attachment Error', err.message || 'Failed to select screenshot.');
    }
  };

  const handleSubmit = async () => {
    if (!subject.trim()) {
      Alert.alert('Required Field', 'Please enter a subject for your ticket.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Required Field', 'Please describe your issue in the message field.');
      return;
    }
    if (!token) return;

    setSubmitting(true);
    try {
      const res = await api.createTicket(
        {
          category,
          subject: subject.trim(),
          message: message.trim(),
          related_transaction_id: selectedTx ? selectedTx.id : undefined,
          attachment_data: attachmentBase64 || undefined,
        },
        token
      );

      if (res.success && res.ticket) {
        Alert.alert(
          'Support Ticket Created 🎉',
          `Your ticket ${res.ticket.ticket_number} has been created. An admin will reply shortly.`,
          [
            {
              text: 'Open Conversation',
              onPress: () => router.replace(`/support/${res.ticket.id}`),
            },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    title: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
    scroll: { padding: 20, paddingBottom: 100, gap: 16 },
    
    label: { fontSize: 13, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 6 },
    subLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 8 },

    // Category Selector
    categoryScroll: { gap: 8, paddingBottom: 4 },
    catPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    catPillSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    catPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.mutedForeground,
      fontFamily: 'Inter_600SemiBold',
    },
    catPillTextSelected: { color: '#FFFFFF' },

    // Inputs
    inputCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    textArea: {
      height: 120,
      textAlignVertical: 'top',
    },

    // Transaction Attach Button
    txSelectBtn: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: selectedTx ? colors.primary : colors.border,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    txSelectText: {
      fontSize: 13,
      color: selectedTx ? colors.foreground : colors.mutedForeground,
      fontFamily: 'Inter_500Medium',
    },

    // Screenshot attachment
    attachRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    attachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    attachBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.foreground,
      fontFamily: 'Inter_600SemiBold',
    },
    previewThumb: {
      width: 44,
      height: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },

    // Submit Button
    submitBtn: {
      borderRadius: 16,
      overflow: 'hidden',
      marginTop: 10,
    },
    submitBtnInner: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    submitBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
      fontFamily: 'Inter_700Bold',
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(5, 3, 15, 0.85)',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      maxHeight: '80%',
      gap: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    txItem: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    txItemDesc: { fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    txItemSub: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Customer Care</Text>
          </Pressable>
          <Text style={s.title}>📝 New Support Ticket</Text>
          <Text style={s.subtitle}>Send a direct request to CoinClash Support</Text>
        </View>

        <ScrollView contentContainerStyle={s.scroll}>
          {/* Category */}
          <View>
            <Text style={s.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryScroll}>
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[s.catPill, isSelected && s.catPillSelected]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[s.catPillText, isSelected && s.catPillTextSelected]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Subject */}
          <View>
            <Text style={s.label}>Subject</Text>
            <TextInput
              style={s.inputCard}
              placeholder="Brief summary of your issue..."
              placeholderTextColor={colors.mutedForeground}
              value={subject}
              onChangeText={setSubject}
            />
          </View>

          {/* Message */}
          <View>
            <Text style={s.label}>Detailed Description</Text>
            <TextInput
              style={[s.inputCard, s.textArea]}
              placeholder="Provide all details, references, or context so our support team can help you quickly..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={5}
              value={message}
              onChangeText={setMessage}
            />
          </View>

          {/* Attach Transaction (Optional) */}
          <View>
            <Text style={s.label}>Related Transaction (Optional)</Text>
            <Text style={s.subLabel}>Attach a deposit or withdrawal transaction for fast resolution.</Text>
            <Pressable style={s.txSelectBtn} onPress={() => setShowTxModal(true)}>
              <Text style={s.txSelectText} numberOfLines={1}>
                {selectedTx
                  ? `🔗 #${selectedTx.id} - ${selectedTx.description} (₦${selectedTx.amount_ngn || 0})`
                  : 'Tap to select a recent transaction...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
            </Pressable>
            {selectedTx && (
              <Pressable onPress={() => setSelectedTx(null)} style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: 'Inter_500Medium' }}>
                  Clear attached transaction
                </Text>
              </Pressable>
            )}
          </View>

          {/* Attach Screenshot (Optional) */}
          <View>
            <Text style={s.label}>Screenshot / Image Attachment (Optional)</Text>
            <View style={s.attachRow}>
              <Pressable style={s.attachBtn} onPress={handlePickImage}>
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                <Text style={s.attachBtnText}>
                  {attachmentBase64 ? 'Change Image' : 'Attach Screenshot'}
                </Text>
              </Pressable>

              {attachmentBase64 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Image source={{ uri: attachmentBase64 }} style={s.previewThumb} />
                  <Pressable onPress={() => setAttachmentBase64(null)}>
                    <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                  </Pressable>
                </View>
              )}
            </View>
          </View>

          {/* Submit Button */}
          <Pressable style={s.submitBtn} onPress={handleSubmit} disabled={submitting}>
            <LinearGradient colors={['#7C3AED', '#5B21B6']} style={s.submitBtnInner}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                  <Text style={s.submitBtnText}>Submit Support Ticket</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </LinearGradient>

      {/* Transaction Selector Modal */}
      <Modal visible={showTxModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Select Related Transaction</Text>
            {loadingTx ? (
              <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 20 }} />
            ) : transactions.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: 'center', marginVertical: 20 }}>
                No recent transactions found.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {transactions.map((tx) => (
                  <Pressable
                    key={tx.id}
                    style={s.txItem}
                    onPress={() => {
                      setSelectedTx(tx);
                      setShowTxModal(false);
                    }}
                  >
                    <Text style={s.txItemDesc}>{tx.description}</Text>
                    <Text style={s.txItemSub}>
                      Ref: {tx.reference || `TX-${tx.id}`} • {new Date(tx.created_at).toLocaleDateString()}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Pressable
              style={[s.attachBtn, { justifyContent: 'center', marginTop: 10 }]}
              onPress={() => setShowTxModal(false)}
            >
              <Text style={s.attachBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
