import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import ringtone from '../../assets/ringtone.wav';

let player: AudioPlayer | null = null;

export async function startRingtone(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });

  if (!player) player = createAudioPlayer(ringtone);
  player.loop = true;
  player.play();
}

export function stopRingtone(): void {
  player?.pause();
}

export function releaseRingtone(): void {
  player?.release();
  player = null;
}

export function playTestRingtone(): void {
  if (!player) player = createAudioPlayer(ringtone);
  player.loop = false;
  player.replace(ringtone);
  player.play();
}

export async function speakPrompt(text: string): Promise<void> {
  await Speech.speak(text, { language: 'en-US', rate: 0.95 });
}

export function stopSpeaking(): void {
  Speech.stop();
}
