# Dancing Alarm — Mobile (React Native + Expo)

Expo SDK 58 app built with **Expo Router**. Same rule as the website: the alarm has **no off or snooze button** — you must dance, clap, and say "hello".

## Run it

```bash
cd mobile
npm install
npx expo start
```

- Scan the QR with **Expo Go**, or press `a` for Android emulator / `i` for iOS simulator.
- For reliable microphone streaming and local notifications, use a development build:
  ```bash
  npx expo run:android   # or: npx expo run:ios (macOS required)
  ```
- Cloud build without local Android Studio/Xcode:
  ```bash
  npx eas-cli@latest build --profile development
  ```

## What's different from the web version

| Feature | Mobile implementation |
| --- | --- |
| Multiple alarms | Create, toggle, and delete alarms from the home screen. Each gets its own scheduled notification. |
| Mobile sensors | Step 1 uses the **accelerometer** (shake/dance). Step 2 uses **mic spike detection** for claps. Step 3 uses **voice-level detection** for "hello". |
| Gamification | +50 XP per wake-up, day streak, level progress bar, haptics, and a celebration screen. |
| Offline + notifications | Alarms, stats, and ring progress are stored with `AsyncStorage`. Local notifications use `expo-notifications` with the bundled `ringtone.wav`. |
| No bypass | Hardware back is blocked, swipe-back is disabled, and ring progress survives app restarts. If mic permission is denied, shake fallbacks keep the challenge solvable. |

## Challenge flow

1. Notification fires (or tap **Try challenge** on the home screen).
2. **Step 1:** shake/dance for ~3 seconds.
3. **Step 2:** clap twice (or shake twice if mic is denied).
4. **Step 3:** say "hello" (or shake steadily if mic is denied).
5. Alarm stops, XP is awarded, streak is updated, and the fired alarm is disabled.

## Project structure

```
src/app/_layout.tsx     Root Stack + notification listeners
src/app/index.tsx       Clock, alarm list, XP/streak, add-alarm form
src/app/challenge.tsx   3-step unskippable challenge
src/lib/storage.ts      AsyncStorage models (alarms, stats, ring state)
src/lib/notifications.ts Local scheduling, permission, custom sound
src/lib/audio.ts        Ringtone playback (expo-audio) + prompts (expo-speech)
src/lib/sensors.ts      Accelerometer + microphone hooks
src/lib/theme.ts        Colors and level helpers
assets/ringtone.wav     Generated looping melody (also used as notification sound)
```

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## Tuning

- `src/lib/sensors.ts` → `motion > 0.18`: dance sensitivity.
- `src/lib/sensors.ts` → `rms > Math.max(0.12, baseline * 2.2)`: clap sensitivity.
- `src/lib/sensors.ts` → `voiceMs / 850`: how long "hello" must last.
- `src/app/challenge.tsx` → `requiredSeconds`: 3s for dance, 1.2s for shake fallback.
- `src/lib/storage.ts` → `recordWin()`: XP and streak rules.
