import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    if (!identifier.trim()) { setErrorMsg('Please enter your email or username.'); return; }
    if (!password) { setErrorMsg('Please enter your password.'); return; }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      setForgotError('Please enter a valid email address.');
      return;
    }
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await api.forgotPasswordRequest(forgotEmail.trim().toLowerCase());
      setForgotSuccess(res.message || 'Verification code sent to your email.');
      setForgotStep('reset');
    } catch (err: any) {
      setForgotError(err.message ?? 'Failed to send reset code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async () => {
    if (resetOtp.trim().length !== 6) {
      setForgotError('Please enter the 6-digit code sent to your email.');
      return;
    }
    if (newPassword.length < 8) {
      setForgotError('New password must be at least 8 characters long.');
      return;
    }
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await api.forgotPasswordReset(
        forgotEmail.trim().toLowerCase(),
        resetOtp.trim(),
        newPassword
      );
      setForgotSuccess(res.message);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep('email');
        setForgotError('');
        setForgotSuccess('');
        setIdentifier(forgotEmail.trim());
      }, 1800);
    } catch (err: any) {
      setForgotError(err.message ?? 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Deep dark gradient background */}
      <LinearGradient
        colors={['#060414', '#0D0829', '#110C35']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Gold glow orb behind logo */}
      <View style={styles.glowOrb} />

      {/* ── Forgot Password Modal ───────────────────────────────────── */}
      {showForgotModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <Pressable onPress={() => { setShowForgotModal(false); setForgotStep('email'); setForgotError(''); setForgotSuccess(''); }}>
                <Ionicons name="close" size={24} color="#8B85B0" />
              </Pressable>
            </View>

            {forgotSuccess ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                <Text style={styles.successText}>{forgotSuccess}</Text>
              </View>
            ) : null}

            {forgotError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#FF3B30" />
                <Text style={styles.errorText}>{forgotError}</Text>
              </View>
            ) : null}

            {forgotStep === 'email' ? (
              <View style={{ gap: 14 }}>
                <Text style={styles.modalSub}>
                  Enter your registered email. We will send you a 6-digit code valid for 10 minutes.
                </Text>
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="mail-outline" size={17} color="#A78BFA" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="you@email.com"
                    placeholderTextColor="#4B4870"
                    value={forgotEmail}
                    onChangeText={(t) => { setForgotEmail(t); setForgotError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <Pressable onPress={handleRequestReset} disabled={forgotLoading} style={styles.loginBtnWrap}>
                  <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.loginBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {forgotLoading ? <ActivityIndicator color="#1a1230" /> : <Text style={styles.loginBtnText}>Send Reset Code ✉️</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                <Text style={styles.modalSub}>
                  Enter the 6-digit code sent to <Text style={{ color: '#F59E0B', fontWeight: '700' }}>{forgotEmail}</Text> and your new password.
                </Text>
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="key-outline" size={17} color="#A78BFA" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit code (e.g. 123456)"
                    placeholderTextColor="#4B4870"
                    value={resetOtp}
                    onChangeText={(t) => { setResetOtp(t.replace(/[^0-9]/g, '').slice(0, 6)); setForgotError(''); }}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <View style={styles.fieldWrap}>
                  <View style={styles.fieldIcon}>
                    <Ionicons name="lock-closed-outline" size={17} color="#A78BFA" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="New password (min 8 chars, 1 upper, 1 digit)"
                    placeholderTextColor="#4B4870"
                    value={newPassword}
                    onChangeText={(t) => { setNewPassword(t); setForgotError(''); }}
                    secureTextEntry
                  />
                </View>
                <Pressable onPress={handleResetSubmit} disabled={forgotLoading} style={styles.loginBtnWrap}>
                  <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.loginBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {forgotLoading ? <ActivityIndicator color="#1a1230" /> : <Text style={styles.loginBtnText}>Save New Password 🔒</Text>}
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Platform.OS === 'web' ? 20 : insets.top + 10, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo area ─────────────────────────── */}
          <View style={styles.logoArea}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.appName}>CoinClash</Text>
            <View style={styles.taglineRow}>
              <View style={styles.taglineDot} />
              <Text style={styles.tagline}>Play. Compete. Win.</Text>
              <View style={styles.taglineDot} />
            </View>
          </View>

          {/* ── Card ──────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome back 👋</Text>
            <Text style={styles.cardSub}>Log in with your Email or Username</Text>

            {/* Error */}
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#FF3B30" style={{ marginTop: 1 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Email or Username */}
            <View style={styles.fieldWrap}>
              <View style={styles.fieldIcon}>
                <Ionicons name="person-outline" size={17} color="#A78BFA" />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Email or Username"
                placeholderTextColor="#4B4870"
                value={identifier}
                onChangeText={(t) => { setIdentifier(t); setErrorMsg(''); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <View style={styles.fieldIcon}>
                <Ionicons name="lock-closed-outline" size={17} color="#A78BFA" />
              </View>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor="#4B4870"
                value={password}
                onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPassword(v => !v)} style={{ paddingHorizontal: 14 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6B6890" />
              </Pressable>
            </View>

            <View style={{ alignItems: 'flex-end', marginTop: -4 }}>
              <Pressable onPress={() => setShowForgotModal(true)}>
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </Pressable>
            </View>

            {/* Login button */}
            <Pressable onPress={handleLogin} disabled={loading} style={styles.loginBtnWrap}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.loginBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading
                  ? <ActivityIndicator color="#1a1230" />
                  : <Text style={styles.loginBtnText}>Log In</Text>}
              </LinearGradient>
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>Don't have an account?</Text>
              <View style={styles.divLine} />
            </View>

            <Link href="/(auth)/signup" asChild>
              <Pressable style={styles.signupBtn}>
                <Text style={styles.signupBtnText}>Create Free Account</Text>
              </Pressable>
            </Link>
          </View>

          {/* Bottom badge */}
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#6B6890" />
            <Text style={styles.badgeText}>Secured · Nigeria · Paystack Payments</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060414' },
  glowOrb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#7C3AED',
    opacity: 0.08,
    top: -80,
    alignSelf: 'center',
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoArea: { alignItems: 'center', marginBottom: 8, gap: 2 },
  logo: { width: 280, height: 280 },
  appName: { fontSize: 32, fontWeight: '800', color: '#F5F0FF', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taglineDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B' },
  tagline: { fontSize: 13, color: '#8B85B0', fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  card: {
    backgroundColor: '#110E2E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2550',
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#F5F0FF', fontFamily: 'Inter_700Bold' },
  cardSub: { fontSize: 13, color: '#6B6890', fontFamily: 'Inter_400Regular', marginTop: -8, marginBottom: 4 },

  errorBox: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
    borderRadius: 10,
    padding: 11,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  errorText: { flex: 1, color: '#FF3B30', fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },

  successBox: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.4)',
    borderRadius: 10,
    padding: 11,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  successText: { flex: 1, color: '#34C759', fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },

  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0A26',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2550',
    overflow: 'hidden',
  },
  fieldIcon: {
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#2A2550',
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F5F0FF',
    fontFamily: 'Inter_400Regular',
  },

  forgotLink: {
    fontSize: 12,
    color: '#A78BFA',
    fontFamily: 'Inter_500Medium',
  },

  loginBtnWrap: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  loginBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  loginBtnText: { fontSize: 16, fontWeight: '700', color: '#1a1230', fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: '#1E1B40' },
  divText: { fontSize: 12, color: '#4B4870', fontFamily: 'Inter_400Regular' },

  signupBtn: {
    borderWidth: 1,
    borderColor: '#7C3AED60',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#7C3AED10',
  },
  signupBtnText: { fontSize: 15, fontWeight: '600', color: '#A78BFA', fontFamily: 'Inter_600SemiBold' },

  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, marginBottom: 8 },
  badgeText: { fontSize: 11, color: '#4B4870', fontFamily: 'Inter_400Regular' },

  // Modal Styles
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6, 4, 20, 0.92)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#110E2E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2550',
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#F5F0FF', fontFamily: 'Inter_700Bold' },
  modalSub: { fontSize: 13, color: '#8B85B0', fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
