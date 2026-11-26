# Dancing Clock 💃🕺

A web alarm clock that **cannot be turned off directly** — you must complete 3 steps to stop it:

1. 💃 **Dance** — about 3 seconds of movement in front of the camera
2. 👏 **Clap** — two claps detected by the microphone
3. 🗣️ **Hello** — say "hello", detected with the Web Speech API (falls back to loud voice if unsupported)

## How to run

The browser needs a **secure context** for camera access, so use a local server instead of opening `index.html` directly.

**Easiest:** double-click `start.bat` — it starts the server and opens the browser for you.

Or manually:

```bash
cd "C:\Users\aman\Desktop\dancing clock"
python -m http.server 8000 --bind 127.0.0.1
```

Then open **http://127.0.0.1:8000** (use `127.0.0.1` instead of `localhost` to avoid IPv6 issues).

> If you see "site can't be reached" or a reload screen, the server is not running — run `start.bat` or the command above again. If port 8000 is busy, change it to `8001` in both the command and the URL.

(VS Code's "Live Server" extension works too.)

> Keep the tab open — the browser cannot sound the alarm if the tab is closed.

## Flow

1. Enter a time and an optional label, then click **Set alarm**.
2. Keep the browser tab open. At the alarm time, the ringtone + vibration start.
3. A full-screen challenge appears — there is **no off/snooze button**.
4. **Step 1:** camera frame-difference detects movement (~3 seconds). Step 2 activates automatically.
5. **Step 2:** microphone detects two sharp claps.
6. **Step 3:** Web Speech API listens for "hello". If speech recognition is unavailable, an 80–400 Hz voice-band detector is used as a fallback.
7. If camera permission is denied, step 1 automatically falls back to the microphone. If the mic is unavailable, retry buttons appear. Chrome/Edge give the best speech recognition support.
8. **Reload protection:** ring state and progress are saved in `localStorage`. After a reload the alarm comes back (click once to re-enable sound), and the browser shows a confirmation prompt before closing/reloading the tab. Browsers do not allow removing the native reload button — but reloading no longer helps. Manually clearing site storage removes this protection.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Clock, alarm form, and ring overlay UI |
| `styles.css` | Neon dance theme and animations |
| `motion.js` | Detection engine: `MotionDetector` (camera frame-diff), `MicMonitor` (clap/voice), `SpeechDetector` ("hello") |
| `app.js` | Alarm scheduling, countdown, Web Audio ringtone, 3-step challenge, reload protection |

## Tuning

- `app.js` → `REQUIRED_ENERGY = 3`: required movement time in seconds.
- `app.js` → `level > 0.2`: how much movement counts as dancing.
- `motion.js` → `(meanDiff - 2) / 14`: camera sensitivity (lower number = more sensitive).
- `app.js` → `CLAPS_REQUIRED = 2`: number of claps required.
- `motion.js` → clap thresholds (`0.13`, `baseline * 2.1`): clap sensitivity.
- `app.js` → `MELODY`: ringtone notes.

To change the steps, edit `startStep(index)` in `app.js` and `#stepsList` in `index.html` — adding a new step is straightforward.

## Later: mobile app

The detection logic is isolated in `motion.js`, so the same "level → energy → dismiss" pattern can be ported to React Native / Flutter. On mobile, use camera frame-diff or an accelerometer to produce the same level; the alarm/ringtone logic in `app.js` can be replaced with the native UI layer.
