export const COLORS = {
  bg: '#080b18',
  surface: '#111833',
  card: '#1a2246',
  border: '#2d3a6b',
  accent: '#ff4fd8',
  accent2: '#5cf2d0',
  gold: '#ffd166',
  danger: '#ff5470',
  text: '#f6f7ff',
  muted: '#9aa6cc',
};

export const STEP_LABELS = [
  'Shake / dance',
  'Clap twice',
  'Say "hello"',
];

export const STEP_ICONS = ['💃', '👏', '🗣️'];

export function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function levelProgress(xp: number): number {
  return (xp % 100) / 100;
}
