import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useMemo } from 'react';
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

// Password strength rules
const PWD_RULES = [
  { key: 'length',  label: 'At least 8 characters',        test: (p: string) => p.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter (A–Z)',    test: (p: string) => /[A-Z]/.test(p) },
  { key: 'number',  label: 'One number (0–9)',              test: (p: string) => /[0-9]/.test(p) },
  { key: 'special', label: 'One special character (!@#$…)', test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

const STRENGTH_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759'];
const STRENGTH_LABELS = ['Weak', 'Fair', 'Good', 'Strong'];

function PasswordStrength({ password }: { password: string }) {
  const passed = PWD_RULES.filter(r => r.test(password)).length;
  const barColor = STRENGTH_COLORS[passed - 1] ?? STRENGTH_COLORS[0];
  const label = STRENGTH_LABELS[passed - 1] ?? STRENGTH_LABELS[0];

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            backgroundColor: i < passed ? barColor : '#1E1B40',
          }} />
        ))}
        <Text style={{ fontSize: 11, color: barColor, fontWeight: '700', marginLeft: 6, width: 44 }}>{label}</Text>
      </View>
      <View style={{ gap: 5 }}>
        {PWD_RULES.map(rule => {
          const ok = rule.test(password);
          return (
            <View key={rule.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={ok ? '#34C759' : '#4B4870'} />
              <Text style={{ fontSize: 12, color: ok ? '#34C759' : '#6B6890', fontFamily: 'Inter_400Regular' }}>{rule.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { signupInitiate, signupVerify, resendOtp } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(params.ref ?? '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendSeconds, setResendSeconds] = useState(60);
  const [resending, setResending] = useState(false);

  // Resend cooldown timer
  React.useEffect(() => {
    let timer: any;
    if (showOtpModal && resendSeconds > 0) {
      timer = setInterval(() => {
        setResendSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showOtpModal, resendSeconds]);

  const pwdPassed = useMemo(() => PWD_RULES.filter(r => r.test(password)).length, [password]);
  const passwordStrong = pwdPassed === PWD_RULES.length;

  const handleSignup = async () => {
    setErrorMsg('');
    if (!email.trim()) { setErrorMsg('Please enter your email address.'); return; }
    if (!email.includes('@') || !email.includes('.')) {
      setErrorMsg('That doesn\'t look like a valid email — e.g. you@gmail.com'); return;
    }
    if (!username.trim()) { setErrorMsg('Please enter a username.'); return; }
    if (username.trim().length < 3) { setErrorMsg('Username must be at least 3 characters.'); return; }
    if (username.trim().length > 20) { setErrorMsg('Username must be 20 characters or less.'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setErrorMsg('Username can only have letters, numbers and underscores — e.g. Flash_King99'); return;
    }
    if (!password) { setErrorMsg('Please enter a password.'); return; }
    if (!passwordStrong) {
      const missing = PWD_RULES.filter(r => !r.test(password)).map(r => r.label);
      setErrorMsg('Password too weak. Missing: ' + missing.join(', ') + '.'); return;
    }

    // Phone validation
    if (!phone.trim()) { setErrorMsg('Please enter your phone number.'); return; }
    const cleanPhone = phone.replace(/\s/g, '').replace(/-/g, '');
    if (!/^(\+234|0)[7-9][01]\d{8}$/.test(cleanPhone)) {
      setErrorMsg('Enter a valid Nigerian phone number — e.g. 08012345678 or +2348012345678'); return;
    }

    setLoading(true);
    try {
      const res = await signupInitiate(
        email.trim().toLowerCase(),
        username.trim(),
        password,
        cleanPhone,
        referralCode.trim() || undefined
      );
      if (res.requiresOtp) {
        setResendSeconds(res.resendCooldown || 60);
        setShowOtpModal(true);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) {
      setOtpError('Please enter the full 6-digit code.');
      return;
    }
    setOtpError('');
    setVerifyingOtp(true);
    try {
      await signupVerify(
        email.trim().toLowerCase(),
        otpCode.trim(),
        referralCode.trim() || undefined
      );
      setShowOtpModal(false);
      router.replace('/(tabs)');
    } catch (err: any) {
      setOtpError(err.message ?? 'Invalid verification code. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || resending) return;
    setResending(true);
    setOtpError('');
    try {
      await resendOtp(email.trim().toLowerCase(), 'signup');
      setResendSeconds(60);
    } catch (err: any) {
      setOtpError(err.message ?? 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#060414', '#0D0829', '#110C35']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.glowOrb} />

      {/* ── OTP Verification Modal ────────────────────────────────────── */}
      {showOtpModal && (
        <View style={styles.otpModalOverlay}>
          <View style={styles.otpModalCard}>
            <View style={styles.otpIconBadge}>
              <Ionicons name="mail-open-outline" size={32} color="#F59E0B" />
            </View>
            <Text style={styles.otpTitle}>Verify Your Email</Text>
            <Text style={styles.otpSub}>
              We sent a 6-digit code to <Text style={{ color: '#F59E0B', fontWeight: '700' }}>{email}</Text>. Code expires in 5 minutes.
            </Text>

            {otpError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#FF3B30" />
                <Text style={styles.errorText}>{otpError}</Text>
              </View>
            ) : null}

            <View style={styles.otpInputWrap}>
              <TextInput
                style={styles.otpInput}
                placeholder="123456"
                placeholderTextColor="#4B4870"
                value={otpCode}
                onChangeText={(t) => {
                  setOtpCode(t.replace(/[^0-9]/g, '').slice(0, 6));
                  setOtpError('');
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>

            <Pressable
              onPress={handleVerifyOtp}
              disabled={verifyingOtp || otpCode.length !== 6}
              style={[styles.otpVerifyBtn, otpCode.length !== 6 && { opacity: 0.5 }]}
            >
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.submitBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {verifyingOtp ? (
                  <ActivityIndicator color="#1a1230" />
                ) : (
                  <Text style={styles.submitText}>Verify & Claim 100 Coins 🎁</Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.resendRow}>
              {resendSeconds > 0 ? (
                <Text style={styles.resendTimerText}>
                  Resend code in <Text style={{ color: '#F59E0B', fontWeight: '700' }}>{resendSeconds}s</Text>
                </Text>
              ) : (
                <Pressable onPress={handleResendOtp} disabled={resending}>
                  <Text style={styles.resendLink}>
                    {resending ? 'Sending...' : 'Resend Verification Code'}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable style={styles.changeEmailBtn} onPress={() => setShowOtpModal(false)}>
              <Text style={styles.changeEmailText}>Edit Registration Details</Text>
            </Pressable>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: Platform.OS === 'web' ? 10 : insets.top + 5, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#A78BFA" />
          </Pressable>

          {/* ── Logo ──────────────────────────── */}
          <View style={styles.logoArea}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.appName}>CoinClash</Text>
            <View style={styles.taglineRow}>
              <View style={styles.taglineDot} />
              <Text style={styles.tagline}>Play. Compete. Win.</Text>
              <View style={styles.taglineDot} />
            </View>
          </View>

          {/* ── Card ──────────────────────────── */}
          <View style={styles.card}>
            {/* Bonus banner */}
            <View style={styles.bonusCard}>
              <Text style={styles.bonusEmoji}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bonusTitle}>100 Free Coins on Signup!</Text>
                <Text style={styles.bonusSub}>Plus referral bonuses when you invite friends</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>Create your account</Text>

            {/* Error */}
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={15} color="#FF3B30" style={{ marginTop: 1 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View>
              <Text style={styles.label}>Email address</Text>
              <View style={styles.fieldWrap}>
                <View style={styles.fieldIcon}><Ionicons name="mail-outline" size={17} color="#A78BFA" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="you@email.com"
                  placeholderTextColor="#4B4870"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Username */}
            <View>
              <Text style={styles.label}>Username</Text>
              <View style={styles.fieldWrap}>
                <View style={styles.fieldIcon}><Ionicons name="person-outline" size={17} color="#A78BFA" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Flash_King99"
                  placeholderTextColor="#4B4870"
                  value={username}
                  onChangeText={(t) => { setUsername(t); setErrorMsg(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.hint}>3–20 chars · letters, numbers & underscores only</Text>
            </View>

            {/* Phone */}
            <View>
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.fieldWrap}>
                <View style={styles.fieldIcon}><Ionicons name="call-outline" size={17} color="#A78BFA" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 08012345678"
                  placeholderTextColor="#4B4870"
                  value={phone}
                  onChangeText={(t) => { setPhone(t); setErrorMsg(''); }}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.hint}>Nigerian number · unique to each account</Text>
            </View>

            {/* Password */}
            <View>
              <Text style={styles.label}>Password</Text>
              <View style={styles.fieldWrap}>
                <View style={styles.fieldIcon}><Ionicons name="lock-closed-outline" size={17} color="#A78BFA" /></View>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Create a strong password"
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
              {password.length > 0 && <PasswordStrength password={password} />}
            </View>

            {/* Referral */}
            <View>
              <Text style={styles.label}>Referral code <Text style={{ color: '#4B4870' }}>(optional)</Text></Text>
              <View style={styles.fieldWrap}>
                <View style={styles.fieldIcon}><Ionicons name="gift-outline" size={17} color="#A78BFA" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 7KQ2PX"
                  placeholderTextColor="#4B4870"
                  value={referralCode}
                  onChangeText={(v) => setReferralCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                />
              </View>
              <Text style={styles.referralHint}>You get 20 coins + they get 25 on your first deposit 🤝</Text>
            </View>

            {/* Submit */}
            <Pressable onPress={handleSignup} disabled={loading} style={{ borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.submitBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading
                  ? <ActivityIndicator color="#1a1230" />
                  : <Text style={styles.submitText}>Continue & Verify Email ✉️</Text>}
              </LinearGradient>
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account?</Text>
              <Link href="/(auth)/login" style={styles.loginLink}>Log in</Link>
            </View>
          </View>

          <View style={styles.badge}>
            <Ionicons name="shield-checkmark-outline" size={13} color="#4B4870" />
            <Text style={styles.badgeText}>Secured · 2-Step OTP Verification · Nigeria</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060414' },
  glowOrb: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: '#7C3AED', opacity: 0.07, top: -60, alignSelf: 'center',
  },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#110E2E', borderWidth: 1, borderColor: '#2A2550',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  logoArea: { alignItems: 'center', marginBottom: 8, gap: 2 },
  logo: { width: 220, height: 220 },
  appName: { fontSize: 28, fontWeight: '800', color: '#F5F0FF', fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taglineDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B' },
  tagline: { fontSize: 12, color: '#8B85B0', fontFamily: 'Inter_400Regular', letterSpacing: 0.5 },

  card: {
    backgroundColor: '#110E2E', borderRadius: 24,
    borderWidth: 1, borderColor: '#2A2550',
    padding: 22, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 12,
  },
  bonusCard: {
    backgroundColor: '#1C1840', borderRadius: 12,
    borderWidth: 1, borderColor: '#F59E0B30',
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  bonusEmoji: { fontSize: 24 },
  bonusTitle: { fontSize: 13, color: '#F59E0B', fontFamily: 'Inter_700Bold' },
  bonusSub: { fontSize: 11, color: '#8B85B0', fontFamily: 'Inter_400Regular', marginTop: 2 },

  cardTitle: { fontSize: 20, fontWeight: '700', color: '#F5F0FF', fontFamily: 'Inter_700Bold' },

  errorBox: {
    backgroundColor: 'rgba(255,59,48,0.12)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)',
    borderRadius: 10, padding: 11, flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  errorText: { flex: 1, color: '#FF3B30', fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },

  label: { fontSize: 12, color: '#8B85B0', fontFamily: 'Inter_500Medium', marginBottom: 6 },
  hint: { fontSize: 11, color: '#4B4870', fontFamily: 'Inter_400Regular', marginTop: 4 },
  referralHint: { fontSize: 11, color: '#7C3AED', fontFamily: 'Inter_500Medium', marginTop: 4 },

  fieldWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D0A26', borderRadius: 14,
    borderWidth: 1, borderColor: '#2A2550', overflow: 'hidden',
  },
  fieldIcon: {
    width: 44, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: '#2A2550', paddingVertical: 14,
  },
  input: {
    flex: 1, paddingHorizontal: 13, paddingVertical: 14,
    fontSize: 14, color: '#F5F0FF', fontFamily: 'Inter_400Regular',
  },

  submitBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#1a1230', fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },

  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 },
  loginText: { fontSize: 13, color: '#6B6890', fontFamily: 'Inter_400Regular' },
  loginLink: { fontSize: 13, color: '#A78BFA', fontFamily: 'Inter_600SemiBold' },

  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, marginBottom: 8 },
  badgeText: { fontSize: 11, color: '#4B4870', fontFamily: 'Inter_400Regular' },

  // OTP Modal Styles
  otpModalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6, 4, 20, 0.94)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  otpModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#110E2E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2550',
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
  },
  otpIconBadge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#1C1840',
    borderWidth: 1, borderColor: '#F59E0B40',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  otpTitle: { fontSize: 22, fontWeight: '800', color: '#F5F0FF', fontFamily: 'Inter_700Bold' },
  otpSub: { fontSize: 13, color: '#8B85B0', fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  otpInputWrap: { width: '100%', marginVertical: 12 },
  otpInput: {
    backgroundColor: '#0D0A26',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 28,
    fontWeight: '800',
    color: '#F59E0B',
    textAlign: 'center',
    letterSpacing: 10,
    fontFamily: 'Inter_700Bold',
  },
  otpVerifyBtn: { width: '100%', borderRadius: 14, overflow: 'hidden' },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  resendTimerText: { fontSize: 13, color: '#8B85B0', fontFamily: 'Inter_400Regular' },
  resendLink: { fontSize: 13, color: '#F59E0B', fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  changeEmailBtn: { paddingVertical: 8, marginTop: 4 },
  changeEmailText: { fontSize: 12, color: '#6B6890', fontFamily: 'Inter_500Medium' },
});
