import { useCallback, useEffect, useRef } from 'react';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { Accelerometer } from 'expo-sensors';

type Vector = { x: number; y: number; z: number };

/** Normalized 0..1 dance energy from device motion (shake / dance). */
export function useMovementEnergy(
  active: boolean,
  onEnergy: (value: number) => void,
  requiredSeconds = 3
): void {
  const callbackRef = useRef(onEnergy);
  useEffect(() => {
    callbackRef.current = onEnergy;
  }, [onEnergy]);

  useEffect(() => {
    if (!active) return;

    let energy = 0;
    let lastAt = 0;
    Accelerometer.setUpdateInterval(60);

    const subscription = Accelerometer.addListener(({ x, y, z }: Vector) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const motion = Math.abs(magnitude - 1);
      const now = Date.now();
      const dt = lastAt ? Math.min((now - lastAt) / 1000, 0.25) : 0;
      lastAt = now;

      if (motion > 0.18) energy += dt * (0.6 + motion);
      else energy -= dt * 0.4;
      energy = Math.max(0, energy);
      callbackRef.current(Math.min(1, energy / requiredSeconds));
    });

    return () => {
      subscription.remove();
      Accelerometer.removeAllListeners();
    };
  }, [active, requiredSeconds]);
}

/** Accelerometer fallback for the clap step when microphone access is denied. */
export function useShakeHits(active: boolean, target: number, onHit: () => void): void {
  const callbackRef = useRef(onHit);
  useEffect(() => {
    callbackRef.current = onHit;
  }, [onHit]);

  useEffect(() => {
    if (!active) return;

    let hits = 0;
    let lastHit = 0;
    Accelerometer.setUpdateInterval(50);

    const subscription = Accelerometer.addListener(({ x, y, z }: Vector) => {
      const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
      const now = Date.now();
      if (motion > 0.55 && now - lastHit > 260) {
        lastHit = now;
        hits += 1;
        callbackRef.current();
        if (hits >= target) subscription.remove();
      }
    });

    return () => subscription.remove();
  }, [active, target]);
}

export type MicMode = 'clap' | 'voice' | null;

/**
 * Real-time microphone analysis with expo-audio:
 * - 'clap' emits 1 on each sharp sound spike.
 * - 'voice' emits a normalized 0..1 value for sustained voice-like sound.
 */
export function useMicDetection(
  active: boolean,
  mode: MicMode,
  onEvent: (value: number) => void,
  onPermission: (granted: boolean) => void
): void {
  const callbackRef = useRef(onEvent);
  const permissionRef = useRef(onPermission);
  const modeRef = useRef(mode);

  useEffect(() => {
    callbackRef.current = onEvent;
    permissionRef.current = onPermission;
    modeRef.current = mode;
  }, [onEvent, onPermission, mode]);

  const tracker = useRef({ baseline: 0.01, lastPeak: 0, voiceMs: 0, lastAt: 0 });

  const onBuffer = useCallback((buffer: { data: ArrayBuffer }) => {
    const currentMode = modeRef.current;
    if (!currentMode) return;

    const values = new Float32Array(buffer.data);
    if (!values.length) return;

    let sum = 0;
    for (let i = 0; i < values.length; i += 1) sum += values[i] * values[i];
    const rms = Math.sqrt(sum / values.length);

    const state = tracker.current;
    state.baseline = state.baseline * 0.985 + rms * 0.015;
    const now = Date.now();
    const dt = state.lastAt ? Math.min(now - state.lastAt, 100) : 30;
    state.lastAt = now;

    if (currentMode === 'clap') {
      if (rms > Math.max(0.12, state.baseline * 2.2) && now - state.lastPeak > 220) {
        state.lastPeak = now;
        callbackRef.current(1);
      }
      return;
    }

    if (rms > Math.max(0.07, state.baseline * 1.6)) state.voiceMs += dt;
    else state.voiceMs = Math.max(0, state.voiceMs - dt);
    callbackRef.current(Math.min(1, state.voiceMs / 850));
  }, []);

  const { stream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'float32',
    onBuffer,
  });

  useEffect(() => {
    if (!active || !mode) return;
    let cancelled = false;

    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      permissionRef.current(granted);
      if (!granted || cancelled) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await stream.start();
    })();

    return () => {
      cancelled = true;
      try {
        stream.stop();
      } catch {
        // Stream may not have started yet.
      }
    };
  }, [active, mode, stream]);
}
