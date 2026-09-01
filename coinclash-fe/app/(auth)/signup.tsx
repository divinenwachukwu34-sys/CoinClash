import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
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

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ref?: string }>();
  const { signup } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(params.ref ?? '');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignup = async () => {
    setErrorMsg('');

    // Email validation
    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setErrorMsg('That doesn\'t look like a valid email. Make sure it has "@" and a domain (e.g. you@gmail.com).');
      return;
    }

    // Username validation
    if (!username.trim()) {
      setErrorMsg('Please enter a username.');
      return;
    }
    if (username.trim().length < 3) {
      setErrorMsg('Username is too short — it must be at least 3 characters.');
      return;
    }
    if (username.trim().length > 20) {
      setErrorMsg('Username is too long — maximum 20 characters allowed.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setErrorMsg('Username can only contain letters, numbers, and underscores — no spaces or symbols. Try something like Flash_King99.');
      return;
    }

    // Password validation
    if (!password) {
      setErrorMsg('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password is too short — it must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), username.trim(), password, referralCode.trim() || undefined);
      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    gradient: {
      flex: 1,
      paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20,
      paddingBottom: insets.bottom + 20,
    },
    scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
    backBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
      marginBottom: 24,
    },
    title: { fontSize: 28, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 24 },
    errorBox: { backgroundColor: 'rgba(255,59,48,0.12)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)', flexDirection: 'row' as const, gap: 8, alignItems: 'flex-start' as const, marginBottom: 16 },
    errorText: { flex: 1, color: '#FF3B30', fontSize: 13, lineHeight: 19, fontFamily: 'Inter_500Medium' },
    card: {
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 24, gap: 16,
    },
    label: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginBottom: 6 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.background, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    },
    input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
    hint: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
    referralHint: { fontSize: 12, color: colors.primary, fontFamily: 'Inter_500Medium', marginTop: 4 },
    signupBtn: { borderRadius: 14, overflow: 'hidden' as const, marginTop: 4 },
    signupBtnInner: { paddingVertical: 16, alignItems: 'center' as const },
    signupBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' },
    bonusCard: {
      backgroundColor: colors.accent + '15', borderRadius: 12,
      borderWidth: 1, borderColor: colors.accent + '40',
      padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    bonusText: { flex: 1, fontSize: 13, color: colors.accent, fontFamily: 'Inter_500Medium' },
    loginRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
    loginText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    loginLink: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0D0A2A', colors.background]} style={s.gradient}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <Pressable style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={colors.foreground} />
            </Pressable>

            <Text style={s.title}>Create account</Text>
            <Text style={s.subtitle}>Join CoinClash and start winning coins</Text>

            <View style={s.card}>
              {errorMsg ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#FF3B30" style={{ marginTop: 2 }} />
                  <Text style={s.errorText}>{errorMsg}</Text>
                </View>
              ) : null}
              <View style={s.bonusCard}>
                <Ionicons name="gift" size={20} color={colors.accent} />
                <Text style={s.bonusText}>Get 100 free coins when you sign up!</Text>
              </View>

              <View>
                <Text style={s.label}>Email address</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="you@email.com"
                    placeholderTextColor={colors.mutedForeground}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View>
                <Text style={s.label}>Username</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. Flash_King99"
                    placeholderTextColor={colors.mutedForeground}
                    value={username}
                    onChangeText={(t) => { setUsername(t); setErrorMsg(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={s.hint}>3–20 characters, letters, numbers and underscores only</Text>
              </View>

              <View>
                <Text style={s.label}>Password</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setErrorMsg(''); }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)}>
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>
              </View>

              <View>
                <Text style={s.label}>Referral code (optional)</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. 7KQ2PX"
                    placeholderTextColor={colors.mutedForeground}
                    value={referralCode}
                    onChangeText={(value) => setReferralCode(value.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                  />
                </View>
                <Text style={s.referralHint}>Have a friend's code? You get 20 bonus coins and they get 25 coins when you make your first deposit.</Text>
              </View>

              <View style={s.signupBtn}>
                <Pressable onPress={handleSignup} disabled={loading}>
                  <LinearGradient colors={[colors.accent, '#059669']} style={s.signupBtnInner}>
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.signupBtnText}>Create Account</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              <View style={s.loginRow}>
                <Text style={s.loginText}>Already have an account?</Text>
                <Link href="/(auth)/login" style={s.loginLink}>Log in</Link>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}
