import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { loadAlarms, saveRingState, type Alarm } from './storage';

const CHANNEL_ID = 'dancing-alarm';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Dancing Alarm',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF4FD8',
      sound: 'ringtone.wav',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function nextOccurrence(hour: number, minute: number): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export async function scheduleAlarmNotification(alarm: Alarm): Promise<string | null> {
  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ ${alarm.label || 'Wake up!'}`,
      body: 'Dance, clap, say hello — there is no snooze!',
      sound: 'ringtone.wav',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      data: { challenge: true, alarmId: alarm.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextOccurrence(alarm.hour, alarm.minute),
    },
  });
}

export async function cancelAlarmNotification(identifier?: string): Promise<void> {
  if (!identifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Already fired or removed by the OS.
  }
}

export async function cancelAllAlarmNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Called when the notification fires or is tapped — creates the unskippable ring state. */
export async function startRingFromAlarm(alarmId: string): Promise<void> {
  const alarms = await loadAlarms();
  const alarm = alarms.find((item) => item.id === alarmId);
  await saveRingState({
    alarmId,
    label: alarm?.label || 'Wake up!',
    step: 0,
    energy: 0,
    claps: 0,
    voiceProgress: 0,
    savedAt: Date.now(),
  });
}

export function addNotificationListeners(onTrigger: (alarmId: string) => void): () => void {
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const alarmId = notification.request.content.data?.alarmId;
    if (notification.request.content.data?.challenge && typeof alarmId === 'string') {
      onTrigger(alarmId);
    }
  });
  const responded = Notifications.addNotificationResponseReceivedListener((response) => {
    const alarmId = response.notification.request.content.data?.alarmId;
    if (response.notification.request.content.data?.challenge && typeof alarmId === 'string') {
      onTrigger(alarmId);
    }
  });
  return () => {
    received.remove();
    responded.remove();
  };
}
