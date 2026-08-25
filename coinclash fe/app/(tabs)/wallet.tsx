import { useWallet } from '@/context/WalletContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api, type BankAccount, type PendingWithdrawal } from '@/lib/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEPOSIT_PACKAGES = [
  { ngn: 100,  total: 35,  bonus: 0,   label: '' },
  { ngn: 200,  total: 75,  bonus: 5,   label: '' },
  { ngn: 500,  total: 200, bonus: 25,  label: 'HOT 🔥' },
  { ngn: 1000, total: 410, bonus: 60,  label: 'PRO' },
  { ngn: 2000, total: 850, bonus: 150, label: 'ELITE' },
];

type Modal_ = 'none' | 'addBank' | 'withdraw' | 'otp' | 'pending';

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { coins, transactions, addTransaction, syncFromServer } = useWallet();
  const { token, refreshUser } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // ── deposit state ──────────────────────────────────────────────────────────
  const [depositLoading, setDepositLoading] = useState<number | null>(null);
  const [pendingRef, setPendingRef] = useState<{ reference: string; coins: number } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // ── bank state ─────────────────────────────────────────────────────────────
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [myBanks, setMyBanks] = useState<BankAccount[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [chosenBank, setChosenBank] = useState<{ name: string; code: string } | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);

  // ── withdrawal state ───────────────────────────────────────────────────────
  const [withdrawCoins, setWithdrawCoins] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [retrying, setRetrying] = useState(false);

  // ── OTP state ─────────────────────────────────────────────────────────────
  const [otpValue, setOtpValue] = useState('');
  const [otpWithdrawalId, setOtpWithdrawalId] = useState<number | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const [activeModal, setActiveModal] = useState<Modal_>('none');

  const closeModal = () => {
    setActiveModal('none');
    setBankSearch(''); setChosenBank(null); setAccountNumber(''); setResolvedName('');
    setWithdrawCoins(''); setOtpValue(''); setOtpWithdrawalId(null);
  };

  // ── fetch data ─────────────────────────────────────────────────────────────
  const fetchMyBanks = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getMyBanks(token);
      setMyBanks(data);
      if (data.length > 0) setSelectedBank((prev) => prev ?? data[0]);
    } catch {}
  }, [token]);

  const fetchPending = useCallback(async () => {
    if (!token) return;
    try { setPendingWithdrawals(await api.getPendingWithdrawals(token)); } catch {}
  }, [token]);

  useEffect(() => {
    fetchMyBanks();
    fetchPending();
  }, [fetchMyBanks, fetchPending]);

  // ── deposit flow ───────────────────────────────────────────────────────────
  const handleDeposit = async (pkg: typeof DEPOSIT_PACKAGES[0]) => {
    if (!token) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDepositLoading(pkg.ngn);
    try {
      const { authorization_url, reference, coins: expectedCoins } = await api.initPayment(pkg.ngn, token);
      setPendingRef({ reference, coins: expectedCoins });

      // Open Paystack checkout
      await WebBrowser.openBrowserAsync(authorization_url, { showTitle: true });

      // Auto-verify after browser closes
      await verifyPayment(reference, expectedCoins);
    } catch (err: any) {
      if (!err.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Could not open payment page', err.message ?? 'Please try again.');
      }
    }
    setDepositLoading(null);
  };

  const verifyPayment = async (reference: string, expectedCoins: number) => {
    setVerifying(true);
    try {
      const { newBalance } = await api.verifyPayment(reference, token!);
      syncFromServer(newBalance);
      addTransaction({ type: 'deposit', amount: expectedCoins, description: `Deposited ${expectedCoins} coins` });
      await refreshUser();
      setPendingRef(null);
      Alert.alert('Payment confirmed! 🎉', `${expectedCoins} coins added to your wallet.`);
    } catch (err: any) {
      // Don't clear pendingRef so user can retry manually
      if (!err.message?.includes('already')) {
        // Still pending — not a hard error, user can tap confirm again
      }
    }
    setVerifying(false);
  };

  const handleManualVerify = async () => {
    if (!pendingRef || !token) return;
    await verifyPayment(pendingRef.reference, pendingRef.coins);
  };

  // ── add bank ───────────────────────────────────────────────────────────────
  const openAddBank = async () => {
    setActiveModal('addBank');
    if (banks.length === 0) {
      setLoadingBanks(true);
      try { setBanks(await api.getBanks(token!)); } catch {}
      setLoadingBanks(false);
    }
  };

  const handleResolveAccount = async () => {
    if (!chosenBank || accountNumber.length !== 10 || !token) return;
    setResolving(true); setResolvedName('');
    try {
      const { account_name } = await api.resolveAccount(accountNumber, chosenBank.code, token);
      setResolvedName(account_name);
    } catch (err: any) { Alert.alert('Verification failed', err.message); }
    setResolving(false);
  };

  const handleSaveBank = async () => {
    if (!chosenBank || !resolvedName || !token) return;
    setSavingBank(true);
    try {
      await api.addBankAccount({ bank_code: chosenBank.code, bank_name: chosenBank.name, account_number: accountNumber, account_name: resolvedName }, token);
      await fetchMyBanks();
      closeModal();
      Alert.alert('Bank account saved!', `${chosenBank.name} · ${resolvedName}`);
    } catch (err: any) { Alert.alert('Error', err.message); }
    setSavingBank(false);
  };

  // ── withdrawal ─────────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!selectedBank || !token) { Alert.alert('Select a bank account first'); return; }
    const amount = parseInt(withdrawCoins, 10);
    if (!amount || amount < 35) { Alert.alert('Minimum withdrawal is 35 coins (₦100)'); return; }
    if (amount > coins) { Alert.alert('Insufficient balance', `You have ${coins} coins`); return; }

    setWithdrawLoading(true);
    try {
      const result = await api.requestWithdrawal(amount, selectedBank.id, token);

      if (result.requiresOtp) {
        // OTP flow
        if (result.newBalance != null) syncFromServer(result.newBalance);
        setOtpWithdrawalId(result.withdrawalId!);
        setActiveModal('otp');
        setWithdrawCoins('');
      } else if (result.queued) {
        // Transfers not yet enabled on Paystack dashboard
        if (result.newBalance != null) syncFromServer(result.newBalance);
        addTransaction({ type: 'withdrawal', amount: -amount, description: `Withdrawal queued → ₦${result.amountNgn}` });
        await fetchPending();
        closeModal();
        Alert.alert(
          'Withdrawal queued ⏳',
          'Your coins have been reserved. To process the transfer, enable Transfers in your Paystack Dashboard:\n\nSettings → Compliance → Complete verification\nSettings → Preferences → Disable Transfer OTP (test)',
          [
            { text: 'Open Paystack', onPress: () => Linking.openURL('https://dashboard.paystack.com/#/settings/preferences') },
            { text: 'OK' },
          ]
        );
      } else if (result.success) {
        if (result.newBalance != null) syncFromServer(result.newBalance);
        addTransaction({ type: 'withdrawal', amount: -amount, description: `Withdrew ${amount} coins → ₦${result.amountNgn}` });
        closeModal();
        Alert.alert('Withdrawal sent! 💸', result.message ?? '');
      }
    } catch (err: any) {
      Alert.alert('Withdrawal failed', err.message);
    }
    setWithdrawLoading(false);
  };

  // ── OTP submit ─────────────────────────────────────────────────────────────
  const handleOtpSubmit = async () => {
    if (!otpWithdrawalId || !otpValue || !token) return;
    setOtpLoading(true);
    try {
      const { message } = await api.finalizeWithdrawal(otpWithdrawalId, otpValue, token);
      closeModal();
      await fetchPending();
      Alert.alert('Transfer confirmed! 💸', message);
    } catch (err: any) {
      Alert.alert('OTP Error', err.message);
    }
    setOtpLoading(false);
  };

  // ── retry queued ───────────────────────────────────────────────────────────
  const handleRetryQueued = async () => {
    if (!token) return;
    setRetrying(true);
    try {
      const { results } = await api.retryQueuedWithdrawals(token);
      await fetchPending();
      const otpNeeded = results.filter((r) => r.status === 'otp');
      const succeeded = results.filter((r) => r.status === 'success');
      const blocked = results.filter((r) => r.status === 'still_blocked');
      let msg = '';
      if (succeeded.length) msg += `${succeeded.length} transfer(s) sent!\n`;
      if (otpNeeded.length) msg += `${otpNeeded.length} need OTP — check your email.\n`;
      if (blocked.length) msg += `${blocked.length} still blocked — transfers not yet enabled.`;
      Alert.alert('Retry complete', msg.trim() || 'No changes');
    } catch (err: any) { Alert.alert('Error', err.message); }
    setRetrying(false);
  };

  const filteredBanks = bankSearch
    ? banks.filter((b) => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    : banks;

  const ngn = Math.floor((coins / 35) * 100);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const formatRelTime = (ts: number) => {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return 'Just now';
  };

  const s = makeStyles(colors, topPad);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0D1A2A', colors.background]} style={s.header}>
        <Text style={s.title}>Wallet</Text>
        <View style={s.balCard}>
          <View>
            <Text style={s.balLabel}>TOTAL BALANCE</Text>
            <View style={s.balRow}>
              <MaterialCommunityIcons name="circle" size={22} color={colors.gold} />
              <Text style={s.balCoins}>{coins.toLocaleString()}</Text>
            </View>
            <Text style={s.balNgn}>≈ ₦{ngn.toLocaleString()} · 35 coins = ₦100</Text>
          </View>
        </View>

        {/* Pending deposit banner */}
        {pendingRef && (
          <Pressable style={s.pendingBanner} onPress={handleManualVerify} disabled={verifying}>
            <Ionicons name="time-outline" size={16} color={colors.gold} />
            <Text style={s.pendingBannerText}>
              {verifying ? 'Verifying payment…' : 'Tap to confirm your payment of ' + pendingRef.coins + ' coins'}
            </Text>
            {verifying && <ActivityIndicator size="small" color={colors.gold} />}
          </Pressable>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Deposit ─────────────────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Buy Coins</Text>
          <View style={s.grid}>
            {DEPOSIT_PACKAGES.map((pkg) => (
              <Pressable
                key={pkg.ngn}
                style={[s.pkgCard, pkg.ngn === 500 && { borderColor: colors.primary }]}
                onPress={() => handleDeposit(pkg)}
                disabled={depositLoading !== null}
              >
                {pkg.label ? <View style={s.pkgBadge}><Text style={s.pkgBadgeText}>{pkg.label}</Text></View> : null}
                <Text style={[s.pkgNgn, { color: colors.gold }]}>₦{pkg.ngn.toLocaleString()}</Text>
                <Text style={s.pkgCoins}>{pkg.total} coins</Text>
                {pkg.bonus > 0 && <Text style={s.pkgBonus}>+{pkg.bonus} bonus</Text>}
                {depositLoading === pkg.ngn && <ActivityIndicator color={colors.primary} size="small" />}
              </Pressable>
            ))}
          </View>
          <Text style={s.depositNote}>
            Payments processed securely by Paystack. Your browser will open the checkout page — return here after paying to confirm.
          </Text>
        </View>

        {/* ── Queued withdrawals notice ────────────────────────────── */}
        {pendingWithdrawals.length > 0 && (
          <View style={s.queuedCard}>
            <View style={s.queuedHeader}>
              <Ionicons name="time" size={18} color={colors.gold} />
              <Text style={s.queuedTitle}>{pendingWithdrawals.length} Withdrawal(s) Queued</Text>
            </View>
            {pendingWithdrawals.map((pw) => (
              <View key={pw.id} style={s.queuedRow}>
                <Text style={s.queuedAmount}>₦{Number(pw.amount_ngn).toLocaleString()} · {pw.bank_name}</Text>
                <View style={[s.queuedStatus, pw.status === 'otp' && { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[s.queuedStatusText, pw.status === 'otp' && { color: colors.primary }]}>
                    {pw.status === 'otp' ? 'Needs OTP' : 'Queued'}
                  </Text>
                </View>
              </View>
            ))}
            <Pressable style={s.retryBtn} onPress={handleRetryQueued} disabled={retrying}>
              {retrying
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="refresh" size={14} color="#fff" /><Text style={s.retryBtnText}>Retry Transfers</Text></>
              }
            </Pressable>
            <Pressable onPress={() => Linking.openURL('https://dashboard.paystack.com/#/settings/preferences')}>
              <Text style={s.psLink}>Open Paystack Dashboard →</Text>
            </Pressable>
          </View>
        )}

        {/* ── Withdraw ────────────────────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>Withdraw to Bank</Text>
          {myBanks.length === 0 ? (
            <Pressable style={s.addBankBtn} onPress={openAddBank}>
              <Ionicons name="add-circle-outline" size={20} color={colors.mutedForeground} />
              <Text style={s.addBankText}>Add bank account to withdraw</Text>
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>
              {myBanks.map((b) => (
                <Pressable
                  key={b.id}
                  style={[s.bankCard, selectedBank?.id === b.id && { borderColor: colors.primary }]}
                  onPress={() => setSelectedBank(b)}
                >
                  <View style={s.bankIcon}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bankName}>{b.bank_name}</Text>
                    <Text style={s.bankAcct}>{b.account_name} · ****{b.account_number.slice(-4)}</Text>
                  </View>
                  {selectedBank?.id === b.id && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </Pressable>
              ))}
              <Pressable style={s.addBankBtn} onPress={openAddBank}>
                <Ionicons name="add-circle-outline" size={18} color={colors.mutedForeground} />
                <Text style={s.addBankText}>Add another account</Text>
              </Pressable>
              <View style={s.wdBtn}>
                <Pressable onPress={() => setActiveModal('withdraw')}>
                  <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.wdBtnInner}>
                    <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                    <Text style={s.wdBtnText}>Withdraw Coins</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* ── Transaction history ──────────────────────────────────── */}
        <View>
          <Text style={s.sectionTitle}>History</Text>
          {transactions.length === 0
            ? <Text style={s.empty}>No transactions yet</Text>
            : transactions.slice(0, 20).map((tx) => {
                const isIn = tx.type === 'deposit' || tx.type === 'win';
                const icn: any = tx.type === 'deposit' ? 'arrow-down-circle'
                  : tx.type === 'win' ? 'trophy'
                  : tx.type === 'withdrawal' ? 'arrow-up-circle' : 'close-circle';
                const col = tx.type === 'deposit' ? colors.accent
                  : tx.type === 'win' ? colors.gold
                  : tx.type === 'withdrawal' ? '#3B82F6' : colors.destructive;
                return (
                  <View key={tx.id} style={s.txRow}>
                    <View style={[s.txIcon, { backgroundColor: col + '20' }]}>
                      <Ionicons name={icn} size={18} color={col} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txDesc}>{tx.description}</Text>
                      <Text style={s.txTime}>{formatRelTime(tx.timestamp)}</Text>
                    </View>
                    <Text style={[s.txAmt, { color: isIn ? colors.accent : colors.destructive }]}>
                      {isIn ? '+' : ''}{tx.amount}
                    </Text>
                  </View>
                );
              })}
        </View>
      </ScrollView>

      {/* ── Add Bank Modal ──────────────────────────────────────────── */}
      <Modal visible={activeModal === 'addBank'} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={closeModal} />
          <ScrollView style={s.modal} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>Add Bank Account</Text>
            {!chosenBank ? (
              <>
                <TextInput style={s.mInput} placeholder="Search bank…" placeholderTextColor={colors.mutedForeground}
                  value={bankSearch} onChangeText={setBankSearch} />
                {loadingBanks
                  ? <ActivityIndicator color={colors.primary} />
                  : <View style={{ maxHeight: 260 }}>
                      <FlatList data={filteredBanks.slice(0, 40)} keyExtractor={(b) => b.code}
                        renderItem={({ item: b }) => (
                          <Pressable style={s.bankListRow} onPress={() => setChosenBank(b)}>
                            <Text style={s.bankListText}>{b.name}</Text>
                          </Pressable>
                        )} />
                    </View>
                }
              </>
            ) : (
              <>
                <Pressable style={s.backRow} onPress={() => { setChosenBank(null); setResolvedName(''); setAccountNumber(''); }}>
                  <Ionicons name="arrow-back" size={16} color={colors.primary} />
                  <Text style={s.backText}>{chosenBank.name}</Text>
                </Pressable>
                <TextInput style={s.mInput} placeholder="Account number (10 digits)"
                  placeholderTextColor={colors.mutedForeground} value={accountNumber}
                  onChangeText={(v) => { setAccountNumber(v); setResolvedName(''); }}
                  keyboardType="numeric" maxLength={10} />
                {accountNumber.length === 10 && !resolvedName && (
                  <Pressable style={s.mBtn} onPress={handleResolveAccount} disabled={resolving}>
                    <LinearGradient colors={[colors.primary, '#4F1ADE']} style={s.mBtnInner}>
                      {resolving ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.mBtnText}>Verify Account</Text>}
                    </LinearGradient>
                  </Pressable>
                )}
                {resolvedName ? (
                  <>
                    <View style={s.verifiedCard}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                      <Text style={s.verifiedText}>{resolvedName}</Text>
                    </View>
                    <Pressable style={s.mBtn} onPress={handleSaveBank} disabled={savingBank}>
                      <LinearGradient colors={[colors.accent, '#059669']} style={s.mBtnInner}>
                        {savingBank ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={s.mBtnText}>Save Bank Account</Text>}
                      </LinearGradient>
                    </Pressable>
                  </>
                ) : null}
              </>
            )}
            <Pressable style={s.cancelRow} onPress={closeModal}><Text style={s.cancelText}>Cancel</Text></Pressable>
            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Withdraw Modal ──────────────────────────────────────────── */}
      <Modal visible={activeModal === 'withdraw'} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={closeModal} />
          <View style={s.modal}>
            <Text style={s.modalTitle}>Withdraw Coins</Text>
            {selectedBank && (
              <View style={s.bankCard}>
                <View style={s.bankIcon}><Ionicons name="business" size={16} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.bankName}>{selectedBank.bank_name}</Text>
                  <Text style={s.bankAcct}>{selectedBank.account_name}</Text>
                </View>
              </View>
            )}
            <TextInput style={s.mInput} placeholder="Coins to withdraw (min 35 = ₦100)"
              placeholderTextColor={colors.mutedForeground} value={withdrawCoins}
              onChangeText={setWithdrawCoins} keyboardType="numeric" />
            {withdrawCoins ? (
              <Text style={s.conversionText}>
                = ₦{Math.floor((parseInt(withdrawCoins || '0', 10) / 35) * 100).toLocaleString()} · Balance after: {coins - parseInt(withdrawCoins || '0', 10)} coins
              </Text>
            ) : null}
            <Pressable style={s.mBtn} onPress={handleWithdraw} disabled={withdrawLoading}>
              <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.mBtnInner}>
                {withdrawLoading ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.mBtnText}>Confirm Withdrawal</Text>}
              </LinearGradient>
            </Pressable>
            <Pressable style={s.cancelRow} onPress={closeModal}><Text style={s.cancelText}>Cancel</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── OTP Modal ───────────────────────────────────────────────── */}
      <Modal visible={activeModal === 'otp'} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <Pressable style={{ flex: 1 }} onPress={closeModal} />
          <View style={s.modal}>
            <Text style={s.modalTitle}>Enter OTP</Text>
            <Text style={s.otpHint}>Paystack sent a one-time password to your registered email. Enter it below to complete the transfer.</Text>
            <TextInput style={[s.mInput, s.otpInput]} placeholder="e.g. 123456"
              placeholderTextColor={colors.mutedForeground} value={otpValue}
              onChangeText={setOtpValue} keyboardType="numeric" maxLength={6} />
            <Pressable style={s.mBtn} onPress={handleOtpSubmit} disabled={otpLoading || otpValue.length < 4}>
              <LinearGradient colors={[colors.accent, '#059669']} style={s.mBtnInner}>
                {otpLoading ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.mBtnText}>Confirm Transfer</Text>}
              </LinearGradient>
            </Pressable>
            <Pressable style={s.cancelRow} onPress={closeModal}><Text style={s.cancelText}>Cancel</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: any, topPad: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 24 },
    title: { fontSize: 28, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    balCard: { marginTop: 16, backgroundColor: colors.primary + '20', borderRadius: 16, borderWidth: 1, borderColor: colors.primary + '40', padding: 20 },
    balLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', letterSpacing: 0.8, textTransform: 'uppercase' },
    balRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    balCoins: { fontSize: 36, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    balNgn: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },

    pendingBanner: {
      marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.gold + '18', borderRadius: 12, borderWidth: 1,
      borderColor: colors.gold + '40', padding: 12,
    },
    pendingBannerText: { flex: 1, fontSize: 13, color: colors.gold, fontFamily: 'Inter_500Medium' },

    scroll: { padding: 20, paddingBottom: 120, gap: 24 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    pkgCard: { width: '47%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 2, borderColor: colors.border, padding: 14, gap: 4 },
    pkgBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.gold + '25', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    pkgBadgeText: { fontSize: 10, color: colors.gold, fontFamily: 'Inter_600SemiBold' },
    pkgNgn: { fontSize: 20, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    pkgCoins: { fontSize: 13, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    pkgBonus: { fontSize: 11, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
    depositNote: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 10, lineHeight: 18 },

    queuedCard: { backgroundColor: colors.gold + '10', borderRadius: 16, borderWidth: 1, borderColor: colors.gold + '30', padding: 16, gap: 10 },
    queuedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    queuedTitle: { fontSize: 15, fontWeight: '600', color: colors.gold, fontFamily: 'Inter_600SemiBold' },
    queuedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    queuedAmount: { fontSize: 13, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    queuedStatus: { backgroundColor: colors.gold + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    queuedStatusText: { fontSize: 11, color: colors.gold, fontFamily: 'Inter_600SemiBold' },
    retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10 },
    retryBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    psLink: { textAlign: 'center', color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 13 },

    bankCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    bankIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
    bankName: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontFamily: 'Inter_600SemiBold' },
    bankAcct: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    addBankBtn: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    addBankText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
    wdBtn: { borderRadius: 14, overflow: 'hidden' },
    wdBtnInner: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    wdBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },

    txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10, marginBottom: 8 },
    txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    txDesc: { fontSize: 13, color: colors.foreground, fontFamily: 'Inter_500Medium' },
    txTime: { fontSize: 11, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 2 },
    txAmt: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter_700Bold' },
    empty: { color: colors.mutedForeground, textAlign: 'center', paddingVertical: 20, fontFamily: 'Inter_400Regular' },
    conversionText: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    modal: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14, maxHeight: '90%' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontFamily: 'Inter_700Bold' },
    mInput: { backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
    mBtn: { borderRadius: 12, overflow: 'hidden' },
    mBtnInner: { paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
    mBtnText: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Inter_700Bold' },
    cancelRow: { alignItems: 'center', paddingVertical: 10 },
    cancelText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    bankListRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    bankListText: { color: colors.foreground, fontFamily: 'Inter_500Medium', fontSize: 14 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    backText: { color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 },
    verifiedCard: { backgroundColor: colors.accent + '15', borderRadius: 10, borderWidth: 1, borderColor: colors.accent + '40', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    verifiedText: { color: colors.accent, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    otpHint: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 20 },
    otpInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  });
}
