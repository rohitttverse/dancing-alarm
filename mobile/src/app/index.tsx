import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playTestRingtone } from '../lib/audio';
import {
  cancelAlarmNotification,
  scheduleAlarmNotification,
} from '../lib/notifications';
import {
  loadAlarms,
  loadRingState,
  loadStats,
  makeId,
  saveAlarms,
  saveRingState,
  type Alarm,
  type Stats,
} from '../lib/storage';
import { COLORS, levelFromXp, levelProgress } from '../lib/theme';

const pad = (value: number) => String(value).padStart(2, '0');

function displayTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${pad(minute)} ${suffix}`;
}

export default function HomeScreen() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [stats, setStats] = useState<Stats>({ xp: 0, streak: 0, lastCompleted: null, wins: 0 });
  const [now, setNow] = useState(new Date());
  const [draft, setDraft] = useState(new Date());
  const [label, setLabel] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [ringing, setRinging] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadAlarms(), loadStats(), loadRingState()]).then(
      ([savedAlarms, savedStats, pendingRing]) => {
        if (!alive) return;
        setAlarms(savedAlarms);
        setStats(savedStats);
        setRinging(!!pendingRing);
        if (pendingRing) router.replace('/challenge');
      }
    );

    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const persist = useCallback(async (next: Alarm[]) => {
    setAlarms(next);
    await saveAlarms(next);
  }, []);

  const addAlarm = async () => {
    const alarm: Alarm = {
      id: makeId(),
      hour: draft.getHours(),
      minute: draft.getMinutes(),
      label: label.trim(),
      enabled: true,
      createdAt: Date.now(),
    };

    const notificationId = await scheduleAlarmNotification(alarm);
    alarm.notificationId = notificationId || undefined;
    await persist([...alarms, alarm]);
    setLabel('');
    setStats((current) => ({ ...current }));

    if (!notificationId) {
      Alert.alert(
        'Notifications blocked',
        'Alarm saved, but it will only fire while the app is open. Enable notifications in your phone settings.'
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const toggleAlarm = async (alarm: Alarm) => {
    const enabled = !alarm.enabled;
    let notificationId = alarm.notificationId;

    if (enabled) {
      notificationId = (await scheduleAlarmNotification({ ...alarm, enabled })) || undefined;
    } else {
      await cancelAlarmNotification(notificationId);
      notificationId = undefined;
    }

    await persist(
      alarms.map((item) => (item.id === alarm.id ? { ...item, enabled, notificationId } : item))
    );
  };

  const deleteAlarm = async (alarm: Alarm) => {
    await cancelAlarmNotification(alarm.notificationId);
    await persist(alarms.filter((item) => item.id !== alarm.id));
  };

  const startDemo = async () => {
    await saveRingState({
      alarmId: 'demo',
      label: 'Dance demo',
      step: 0,
      energy: 0,
      claps: 0,
      voiceProgress: 0,
      savedAt: Date.now(),
    });
    router.push('/challenge');
  };

  const level = levelFromXp(stats.xp);
  const progress = Math.round(levelProgress(stats.xp) * 100);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>🕺 NO SNOOZE. ONLY DANCE.</Text>
            <Text style={styles.title}>Dancing Alarm</Text>
          </View>
          <View style={styles.levelPill}>
            <Text style={styles.levelText}>LV {level}</Text>
          </View>
        </View>

        <View style={styles.clockCard}>
          <Text style={styles.clock}>{displayTime(now.getHours(), now.getMinutes())}</Text>
          <Text style={styles.seconds}>:{pad(now.getSeconds())}</Text>
          <Text style={styles.date}>
            {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>🔥 {stats.streak}</Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>🏆 {stats.wins}</Text>
            <Text style={styles.statLabel}>Wake-ups</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>⭐ {stats.xp}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
        </View>

        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.xpCaption}>{progress}% to level {level + 1} · +50 XP per completed alarm</Text>

        {ringing && (
          <TouchableOpacity style={styles.ringBanner} onPress={() => router.push('/challenge')}>
            <Text style={styles.ringBannerText}>🔔 Alarm is still ringing — finish the challenge!</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>⏰ Add an alarm</Text>
          <TouchableOpacity style={styles.timeButton} onPress={() => setShowPicker(true)}>
            <Text style={styles.timeButtonText}>{displayTime(draft.getHours(), draft.getMinutes())}</Text>
            <Text style={styles.timeButtonHint}>Tap to change</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={draft}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_: unknown, date?: Date) => {
                if (Platform.OS === 'android') setShowPicker(false);
                if (date) setDraft(date);
              }}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Label (e.g. Dance break!)"
            placeholderTextColor={COLORS.muted}
            value={label}
            maxLength={40}
            onChangeText={setLabel}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={() => void addAlarm()}>
            <Text style={styles.primaryText}>Save alarm 🚀</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Your alarms ({alarms.length})</Text>
          {alarms.length === 0 && (
            <Text style={styles.empty}>No alarms yet. Add one above — then try the demo!</Text>
          )}
          {alarms.map((alarm) => (
            <View key={alarm.id} style={styles.alarmRow}>
              <View style={styles.alarmInfo}>
                <Text style={styles.alarmTime}>{displayTime(alarm.hour, alarm.minute)}</Text>
                <Text style={styles.alarmLabel}>{alarm.label || 'Wake up!'}</Text>
              </View>
              <Switch
                value={alarm.enabled}
                onValueChange={() => void toggleAlarm(alarm)}
                trackColor={{ false: COLORS.border, true: COLORS.accent }}
                thumbColor={COLORS.text}
              />
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => void deleteAlarm(alarm)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.ghostButton} onPress={playTestRingtone}>
            <Text style={styles.ghostText}>🔊 Test ringtone</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={() => void startDemo()}>
            <Text style={styles.ghostText}>🧪 Try challenge</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tip}>
          When the alarm fires: shake/dance for 3s → clap twice → say &quot;hello&quot;. No direct off
          button — not even the back button. 🔒
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  kicker: { color: COLORS.accent2, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  title: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginTop: 3 },
  levelPill: { backgroundColor: COLORS.card, borderColor: COLORS.accent, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  levelText: { color: COLORS.gold, fontWeight: '800' },
  clockCard: { marginTop: 20, backgroundColor: COLORS.surface, borderRadius: 22, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  clock: { color: COLORS.text, fontSize: 46, fontWeight: '800', letterSpacing: 1 },
  seconds: { color: COLORS.accent, fontSize: 18, fontWeight: '700', marginTop: -10 },
  date: { color: COLORS.muted, marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  statLabel: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  xpTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.card, marginTop: 14, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: COLORS.accent2 },
  xpCaption: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  ringBanner: { backgroundColor: COLORS.danger, borderRadius: 14, padding: 14, marginTop: 16 },
  ringBannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  card: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 18, marginTop: 18, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  timeButton: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeButtonText: { color: COLORS.accent2, fontSize: 24, fontWeight: '800' },
  timeButtonHint: { color: COLORS.muted, fontSize: 12 },
  input: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, color: COLORS.text, marginTop: 12 },
  primaryButton: { backgroundColor: COLORS.accent, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#1a0b1f', fontWeight: '800', fontSize: 16 },
  empty: { color: COLORS.muted, lineHeight: 20 },
  alarmRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  alarmInfo: { flex: 1 },
  alarmTime: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  alarmLabel: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  deleteButton: { marginLeft: 12, padding: 6 },
  deleteText: { color: COLORS.danger, fontSize: 18, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  ghostButton: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  ghostText: { color: COLORS.text, fontWeight: '700' },
  tip: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 18, textAlign: 'center' },
});
