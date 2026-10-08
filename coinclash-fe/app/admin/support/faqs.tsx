import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, SupportFaq } from '@/lib/api';

const ADMIN_EMAIL = 'admin@coinclash.com';

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

export default function AdminFaqScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();

  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<SupportFaq | null>(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin Guard
  useEffect(() => {
    if (user && !user.isAdmin && user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user]);

  const fetchFaqs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getAdminFaqs(token);
      setFaqs(res.faqs || []);
    } catch (err) {
      console.warn('Error fetching admin FAQs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFaqs();
  };

  const openCreateModal = () => {
    setEditingFaq(null);
    setCategory(CATEGORIES[0]);
    setQuestion('');
    setAnswer('');
    setIsActive(true);
    setShowModal(true);
  };

  const openEditModal = (faq: SupportFaq) => {
    setEditingFaq(faq);
    setCategory(faq.category);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setIsActive(faq.is_active);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) {
      Alert.alert('Required Fields', 'Question and answer are required.');
      return;
    }
    if (!token) return;

    setSaving(true);
    try {
      if (editingFaq) {
        await api.updateAdminFaq(
          editingFaq.id,
          { category, question: question.trim(), answer: answer.trim(), is_active: isActive },
          token
        );
      } else {
        await api.createAdminFaq(
          { category, question: question.trim(), answer: answer.trim() },
          token
        );
      }
      setShowModal(false);
      fetchFaqs();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save FAQ.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (faqId: number) => {
    Alert.alert('Delete FAQ?', 'Are you sure you want to delete this FAQ item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token) return;
          try {
            await api.deleteAdminFaq(faqId, token);
            fetchFaqs();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete FAQ.');
          }
        },
      },
    ]);
  };

  const handleToggleActive = async (faq: SupportFaq, newValue: boolean) => {
    if (!token) return;
    try {
      await api.updateAdminFaq(faq.id, { is_active: newValue }, token);
      fetchFaqs();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update FAQ status.');
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    backText: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_500Medium' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    addBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },

    listContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    categoryTag: { fontSize: 11, fontWeight: '700', color: colors.primary, fontFamily: 'Inter_700Bold' },
    questionText: { fontSize: 14, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    answerText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 18 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 3, 15, 0.85)', justifyContent: 'center', padding: 20 },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 14,
      maxHeight: '85%',
    },
    modalTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    label: { fontSize: 12, fontWeight: '700', color: colors.mutedForeground, fontFamily: 'Inter_700Bold' },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    textArea: { height: 100, textAlignVertical: 'top' },
    modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    saveBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    cancelBtn: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    btnText: { fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#1a0533', colors.background]} style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={s.backText}>Dashboard</Text>
          </Pressable>
          <View style={s.topRow}>
            <Text style={s.title}>❓ FAQ Management</Text>
            <Pressable style={s.addBtn} onPress={openCreateModal}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={s.addBtnText}>Add FAQ</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={faqs}
            keyExtractor={(f) => String(f.id)}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            renderItem={({ item: f }) => (
              <View style={[s.card, !f.is_active && { opacity: 0.6 }]}>
                <View style={s.cardHeader}>
                  <Text style={s.categoryTag}>{f.category}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Active</Text>
                    <Switch
                      value={f.is_active}
                      onValueChange={(val) => handleToggleActive(f, val)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                    />
                  </View>
                </View>

                <Text style={s.questionText}>{f.question}</Text>
                <Text style={s.answerText}>{f.answer}</Text>

                <View style={s.actionRow}>
                  <Pressable onPress={() => openEditModal(f)}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(f.id)}>
                    <Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </LinearGradient>

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{editingFaq ? 'Edit FAQ' : 'Add New FAQ'}</Text>
            <ScrollView style={{ maxHeight: 350 }}>
              <View style={{ gap: 10 }}>
                <Text style={s.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[
                        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
                        category === cat && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[{ fontSize: 11, color: colors.mutedForeground }, category === cat && { color: '#FFFFFF', fontWeight: '700' }]}>
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={s.label}>Question</Text>
                <TextInput
                  style={s.input}
                  value={question}
                  onChangeText={setQuestion}
                  placeholder="FAQ question..."
                  placeholderTextColor={colors.mutedForeground}
                />

                <Text style={s.label}>Answer</Text>
                <TextInput
                  style={[s.input, s.textArea]}
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder="Detailed answer..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={s.modalBtnRow}>
              <Pressable style={s.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={[s.btnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>

              <Pressable style={s.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={s.btnText}>Save FAQ</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
