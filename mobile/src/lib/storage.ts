import AsyncStorage from '@react-native-async-storage/async-storage';

export type Alarm = {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
  notificationId?: string;
  createdAt: number;
};

export type Stats = {
  xp: number;
  streak: number;
  lastCompleted: string | null;
  wins: number;
};

export type RingState = {
  alarmId: string;
  label: string;
  step: number;
  energy: number;
  claps: number;
  voiceProgress: number;
  savedAt: number;
};

const ALARMS_KEY = 'dancing-alarm:alarms';
const STATS_KEY = 'dancing-alarm:stats';
const RING_KEY = 'dancing-alarm:ringing';

const EMPTY_STATS: Stats = { xp: 0, streak: 0, lastCompleted: null, wins: 0 };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback === null) return (parsed || null) as T;
    return { ...fallback, ...parsed } as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Offline storage may be unavailable; the app still works in memory.
  }
}

export function loadAlarms(): Promise<Alarm[]> {
  return readJson<Alarm[]>(ALARMS_KEY, []).then((list) => (Array.isArray(list) ? list : []));
}

export function saveAlarms(alarms: Alarm[]): Promise<void> {
  return writeJson(ALARMS_KEY, alarms);
}

export function loadStats(): Promise<Stats> {
  return readJson<Stats>(STATS_KEY, EMPTY_STATS);
}

export function saveStats(stats: Stats): Promise<void> {
  return writeJson(STATS_KEY, stats);
}

export function loadRingState(): Promise<RingState | null> {
  return readJson<RingState | null>(RING_KEY, null);
}

export function saveRingState(state: RingState): Promise<void> {
  return writeJson(RING_KEY, { ...state, savedAt: Date.now() });
}

export function clearRingState(): Promise<void> {
  return AsyncStorage.removeItem(RING_KEY).catch(() => undefined);
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function recordWin(): Promise<Stats> {
  const stats = await loadStats();
  const today = dateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  let streak = stats.streak;
  if (stats.lastCompleted !== today) {
    streak = stats.lastCompleted === dateKey(yesterday) ? stats.streak + 1 : 1;
  }

  const next: Stats = {
    xp: stats.xp + 50,
    streak,
    lastCompleted: today,
    wins: stats.wins + 1,
  };
  await saveStats(next);
  return next;
}

export function makeId(): string {
  return `alarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
