import { useColors } from '@/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export default function TrophyCelebration() {
  const colors = useColors();
  const router = useRouter();

  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 10 });
    opacity.value = withTiming(1, { duration: 500 });
    glowOpacity.value = withRepeat(
      withTiming(0.8, { duration: 1000 }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#3B0764', '#1A1A3A']} style={styles.gradient}>
        
        <Animated.View style={[styles.glow, glowStyle]} />
        
        <Animated.View style={[styles.content, animStyle]}>
          <Ionicons name="trophy" size={120} color={colors.gold} style={styles.icon} />
          <Text style={styles.title}>Tournament Winner!</Text>
          <Text style={styles.subtitle}>You survived the longest and claimed the top prize!</Text>
        </Animated.View>

        <Pressable style={styles.btn} onPress={() => router.replace('/(tabs)/tournaments')}>
          <LinearGradient colors={[colors.gold, '#D97706']} style={styles.btnGrad}>
            <Text style={styles.btnText}>Claim Reward</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#D946EF',
    filter: 'blur(50px)',
  },
  content: {
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  icon: {
    textShadowColor: 'rgba(255, 215, 0, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    maxWidth: 250,
  },
  btn: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    paddingHorizontal: 20,
  },
  btnGrad: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
});
