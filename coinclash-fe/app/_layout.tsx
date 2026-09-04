import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { WalletProvider } from '@/context/WalletContext';
import { GameProvider } from '@/context/GameContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { View, ActivityIndicator } from 'react-native';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const SLIDE_UP = { animation: 'slide_from_bottom' } as const;
const FADE = { animation: 'fade', gestureEnabled: false } as const;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useAuth();
  const { syncFromServer } = useWallet();
  const router = useRouter();
  const segments = useSegments();

  // Redirect based on auth state
  useEffect(() => {
    if (authLoading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)');
    }
  }, [user, authLoading, segments]);

  // Sync server coin balance into local wallet
  useEffect(() => {
    if (user?.coinBalance != null) syncFromServer(user.coinBalance);
  }, [user?.id, user?.coinBalance, syncFromServer]);

  if (authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0B14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#7C3AED" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="game/select" options={SLIDE_UP} />
      <Stack.Screen name="game/play" options={SLIDE_UP} />
      <Stack.Screen name="game/color-match" options={SLIDE_UP} />
      <Stack.Screen name="game/math-duel" options={SLIDE_UP} />
      <Stack.Screen name="game/memory-flash" options={SLIDE_UP} />
      <Stack.Screen name="game/aim-rush" options={SLIDE_UP} />
      <Stack.Screen name="game/swipe-duel" options={SLIDE_UP} />
      <Stack.Screen name="game/number-catch" options={SLIDE_UP} />
      <Stack.Screen name="game/word-scramble" options={SLIDE_UP} />
      <Stack.Screen name="game/trivia" options={SLIDE_UP} />
      <Stack.Screen name="game/result" options={FADE} />
    </Stack>
  );
}

import { Platform } from 'react-native';

function WebContainer({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: '#05050A', alignItems: 'center' }}>
        <View style={{ 
          flex: 1, 
          width: '100%', 
          maxWidth: 480, 
          backgroundColor: '#0B0B14',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: 'rgba(255,255,255,0.05)'
        }}>
          {children}
        </View>
      </View>
    );
  }
  return <>{children}</>;
}

import { NotificationProvider } from '@/context/NotificationContext';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NotificationProvider>
              <WalletProvider>
                <GameProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <WebContainer>
                        <AuthGuard>
                          <RootLayoutNav />
                        </AuthGuard>
                      </WebContainer>
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </GameProvider>
              </WalletProvider>
            </NotificationProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
