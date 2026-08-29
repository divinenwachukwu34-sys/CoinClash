import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
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

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Login failed', err.message ?? 'Please check your credentials.');
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
    logoArea: { alignItems: 'center', marginBottom: 40, gap: 12 },
    logoCircle: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: colors.primary + '30',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: colors.primary + '60',
    },
    appName: { fontSize: 32, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold' },
    tagline: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    card: {
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, padding: 24, gap: 16,
    },
    cardTitle: { fontSize: 20, fontWeight: '700' as const, color: colors.foreground, fontFamily: 'Inter_700Bold', marginBottom: 4 },
    label: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginBottom: 6 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.background, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14,
    },
    input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
    loginBtn: { borderRadius: 14, overflow: 'hidden' as const, marginTop: 4 },
    loginBtnInner: { paddingVertical: 16, alignItems: 'center' as const },
    loginBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#fff', fontFamily: 'Inter_700Bold' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    divLine: { flex: 1, height: 1, backgroundColor: colors.border },
    divText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    signupRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
    signupText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    signupLink: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
  });

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0D0A2A', colors.background]} style={s.gradient}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.logoArea}>
              <View style={s.logoCircle}>
                <Ionicons name="game-controller" size={32} color={colors.primary} />
              </View>
              <Text style={s.appName}>CoinClash</Text>
              <Text style={s.tagline}>Play. Win. Earn.</Text>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Welcome back</Text>

              <View>
                <Text style={s.label}>Email address</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="you@email.com"
                    placeholderTextColor={colors.mutedForeground}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View>
                <Text style={s.label}>Password</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
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

              <View style={s.loginBtn}>
                <Pressable onPress={handleLogin} disabled={loading}>
                  <LinearGradient colors={[colors.primary, '#4F1ADE']} style={s.loginBtnInner}>
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={s.loginBtnText}>Log In</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              <View style={s.divider}>
                <View style={s.divLine} />
                <Text style={s.divText}>or</Text>
                <View style={s.divLine} />
              </View>

              <View style={s.signupRow}>
                <Text style={s.signupText}>Don't have an account?</Text>
                <Link href="/(auth)/signup" style={s.signupLink}>
                  Sign up free
                </Link>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}
