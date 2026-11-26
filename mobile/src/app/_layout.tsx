import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { addNotificationListeners, startRingFromAlarm } from '../lib/notifications';
import { COLORS } from '../lib/theme';

export default function RootLayout() {
  const router = useRouter();
  const lastTrigger = useRef(0);

  useEffect(() => {
    const removeListeners = addNotificationListeners((alarmId) => {
      const now = Date.now();
      if (now - lastTrigger.current < 1500) return;
      lastTrigger.current = now;
      void startRingFromAlarm(alarmId).then(() => router.push('/challenge'));
    });
    return removeListeners;
  }, [router]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.bg },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="challenge" options={{ gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
