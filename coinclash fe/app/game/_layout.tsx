import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Audio } from 'expo-av';
import { AppState } from 'react-native';

export default function GameLayout() {
  useEffect(() => {
    let bgmSound: Audio.Sound | null = null;

    async function setupAudio() {
      try {
        // Enable audio playback in silent mode on iOS
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        // Load and play a royalty-free game melody
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
          { shouldPlay: true, isLooping: true, volume: 0.4 }
        );
        bgmSound = sound;
      } catch (e) {
        console.warn('Could not load game audio', e);
      }
    }

    setupAudio();

    // Pause audio if the app goes to the background
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (bgmSound) {
        if (nextAppState === 'active') {
          bgmSound.playAsync();
        } else {
          bgmSound.pauseAsync();
        }
      }
    });

    return () => {
      subscription.remove();
      if (bgmSound) {
        bgmSound.stopAsync();
        bgmSound.unloadAsync();
      }
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
