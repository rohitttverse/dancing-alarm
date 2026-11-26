import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { speakPrompt, startRingtone, stopRingtone, stopSpeaking } from '../lib/audio';
import { useMicDetection, useMovementEnergy, useShakeHits } from '../lib/sensors';
import {
  clearRingState,
  loadAlarms,
  loadRingState,
  recordWin,
  saveAlarms,
  saveRingState,
  type RingState,
} from '../lib/storage';
import { COLORS, STEP_ICONS, STEP_LABELS } from '../lib/theme';

const DEFAULT_RING: RingState = {
  alarmId: 'demo',
  label: 'Wake up!',
  step: 0,
  energy: 0,
  claps: 0,
  voiceProgress: 0,
  savedAt: Date.now(),
};

export default function ChallengeScreen() {
  const router = useRouter();
  useKeepAwake();
  const [ring, setRing] = useState<RingState | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [finished, setFinished] = useState(false);
  const [totalXp, setTotalXp] = useState(0);

  const ringRef = useRef<RingState | null>(null);
  const finishedRef = useRef(false);
  const celebrate = useMemo(() => new Animated.Value(0.7), []);

  // Hardware back is disabled while the alarm is ringing — no sneaky way out.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    let alive = true;
    void loadRingState().then((saved) => {
      if (!alive) return;
      const initial = saved || DEFAULT_RING;
      ringRef.current = initial;
      setRing(initial);
      void startRingtone();
      void speakPrompt('Dance to turn off the alarm!');
    });

    return () => {
      alive = false;
      stopRingtone();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (ring && !finished) void saveRingState(ring);
  }, [ring, finished]);

  useEffect(() => {
    if (finished) Animated.spring(celebrate, { toValue: 1, useNativeDriver: true }).start();
  }, [finished, celebrate]);

  const patch = useCallback((updater: (current: RingState) => RingState) => {
    const current = ringRef.current;
    if (!current || finishedRef.current) return;
    const next = updater(current);
    ringRef.current = next;
    setRing(next);
  }, []);

  const advance = useCallback(() => {
    const current = ringRef.current;
    if (!current || current.step >= 2) return;
    const nextStep = current.step + 1;
    patch((value) => ({ ...value, step: nextStep }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void speakPrompt(nextStep === 1 ? 'Clap twice!' : 'Say hello!');
  }, [patch]);

  const finish = useCallback(async () => {
    if (finishedRef.current || !ringRef.current) return;
    finishedRef.current = true;
    const current = ringRef.current;

    stopRingtone();
    stopSpeaking();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const stats = await recordWin();
    const alarms = await loadAlarms();
    await saveAlarms(
      alarms.map((alarm) =>
        alarm.id === current.alarmId ? { ...alarm, enabled: false, notificationId: undefined } : alarm
      )
    );
    await clearRingState();

    setTotalXp(stats.xp);
    setFinished(true);
  }, []);

  useEffect(() => {
    if (!ring || finished) return;
    if (ring.step === 0 && ring.energy >= 1) advance();
    else if (ring.step === 1 && ring.claps >= 2) advance();
    else if (ring.step === 2 && ring.voiceProgress >= 1) void finish();
  }, [ring, finished, advance, finish]);

  const movementActive = !!ring && !finished && (ring.step === 0 || (ring.step === 2 && micDenied));

  const onMovement = useCallback(
    (value: number) => {
      patch((current) => {
        if (current.step === 0 && value > current.energy) return { ...current, energy: value };
        if (current.step === 2 && micDenied && value > current.voiceProgress) {
          return { ...current, voiceProgress: value };
        }
        return current;
      });
    },
    [micDenied, patch]
  );

  useMovementEnergy(movementActive, onMovement, ring?.step === 2 ? 1.2 : 3);

  const shakeActive = !!ring && !finished && ring.step === 1 && micDenied;
  const onShakeHit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    patch((current) => ({ ...current, claps: Math.min(2, current.claps + 1) }));
  }, [patch]);
  useShakeHits(shakeActive, 2, onShakeHit);

  const micMode = ring && !finished && !micDenied
    ? ring.step === 1 ? 'clap' : ring.step === 2 ? 'voice' : null
    : null;
  const onMicEvent = useCallback(
    (value: number) => {
      patch((current) => {
        if (current.step === 1 && value >= 1) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          return { ...current, claps: Math.min(2, current.claps + 1) };
        }
        if (current.step === 2 && value > current.voiceProgress) {
          return { ...current, voiceProgress: value };
        }
        return current;
      });
    },
    [patch]
  );
  const onMicPermission = useCallback((granted: boolean) => {
    if (!granted) setMicDenied(true);
  }, []);
  useMicDetection(!!micMode, micMode, onMicEvent, onMicPermission);

  const retryMic = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (granted) setMicDenied(false);
    else Alert.alert('Microphone blocked', 'Enable microphone access in your phone settings, or keep using the shake fallback.');
  };

  const progress = ring
    ? ring.step === 0 ? ring.energy : ring.step === 1 ? ring.claps / 2 : ring.voiceProgress
    : 0;

  if (finished) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Animated.Text style={[styles.celebrate, { transform: [{ scale: celebrate }] }]}>🎉</Animated.Text>
          <Text style={styles.successTitle}>Alarm off!</Text>
          <Text style={styles.successText}>All 3 steps complete — you earned +50 XP.</Text>
          <Text style={styles.successMeta}>🔥 Streak extended · ⭐ {totalXp} total XP</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
            <Text style={styles.primaryText}>Back to alarms 🏠</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🔔 ALARM RINGING</Text>
        </View>
        <Text style={styles.title}>{ring?.label || 'WAKE UP!'} 💃</Text>
        <Text style={styles.subtitle}>No off button — finish all 3 steps.</Text>

        <View style={styles.steps}>
          {STEP_LABELS.map((label, index) => {
            const active = ring?.step === index;
            const done = !!ring && index < ring.step;
            return (
              <View
                key={label}
                style={[styles.stepRow, active && styles.stepActive, done && styles.stepDone]}>
                <Text style={styles.stepIcon}>{STEP_ICONS[index]}</Text>
                <Text style={[styles.stepLabel, (active || done) && styles.stepLabelBright]}>{label}</Text>
                <Text style={styles.stepCheck}>{done ? '✓' : active ? '▶' : ''}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.meterCard}>
          <View style={styles.meterHead}>
            <Text style={styles.meterLabel}>
              {ring?.step === 0
                ? 'Dance energy ⚡'
                : ring?.step === 1
                ? 'Clap count 👏'
                : 'Hello power 🗣️'}
            </Text>
            <Text style={styles.meterPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.hint}>
            {ring?.step === 0
              ? micDenied
                ? 'Shake your phone continuously for 3 seconds 💃'
                : 'Shake / dance with your phone for ~3 seconds 💃'
              : ring?.step === 1
              ? micDenied
                ? 'Shake your phone twice — mic fallback active 👏'
                : 'Clap twice near the microphone 👏'
              : micDenied
                ? 'Shake steadily for 1 second — mic fallback active 🗣️'
                : 'Say "hello" out loud — I am listening 🗣️'}
          </Text>
        </View>

        {micDenied && (
          <TouchableOpacity style={styles.retryButton} onPress={() => void retryMic()}>
            <Text style={styles.retryText}>🎤 Enable microphone</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.lockNote}>🔒 Reload, restart or back button cannot stop this alarm.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 22, paddingTop: 40 },
  badge: { alignSelf: 'center', backgroundColor: COLORS.danger, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: COLORS.text, fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  subtitle: { color: COLORS.muted, textAlign: 'center', marginTop: 6 },
  steps: { marginTop: 28, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  stepActive: { borderColor: COLORS.accent, backgroundColor: COLORS.card },
  stepDone: { borderColor: COLORS.accent2, opacity: 0.75 },
  stepIcon: { fontSize: 24, marginRight: 12 },
  stepLabel: { color: COLORS.muted, flex: 1, fontSize: 16 },
  stepLabelBright: { color: COLORS.text, fontWeight: '700' },
  stepCheck: { color: COLORS.accent2, fontSize: 18, fontWeight: '800' },
  meterCard: { marginTop: 24, backgroundColor: COLORS.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between' },
  meterLabel: { color: COLORS.text, fontWeight: '700' },
  meterPercent: { color: COLORS.accent2, fontWeight: '800' },
  meterTrack: { height: 12, borderRadius: 6, backgroundColor: COLORS.card, marginTop: 12, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: COLORS.accent },
  hint: { color: COLORS.muted, lineHeight: 20, marginTop: 14, textAlign: 'center' },
  retryButton: { marginTop: 16, alignSelf: 'center', backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border },
  retryText: { color: COLORS.accent2, fontWeight: '700' },
  lockNote: { color: COLORS.muted, fontSize: 11, textAlign: 'center', marginTop: 'auto', marginBottom: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  celebrate: { fontSize: 76 },
  successTitle: { color: COLORS.text, fontSize: 30, fontWeight: '800', marginTop: 12 },
  successText: { color: COLORS.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  successMeta: { color: COLORS.gold, marginTop: 10, marginBottom: 28 },
  primaryButton: { backgroundColor: COLORS.accent, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 15 },
  primaryText: { color: '#1a0b1f', fontWeight: '800' },
});
