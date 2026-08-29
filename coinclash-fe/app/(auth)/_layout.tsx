import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
