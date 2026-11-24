# Dancing Clock 💃🕺

Ek web alarm clock jise **directly band nahi kar sakte** — alarm rokne ke liye 3 steps pooré karne padte hain:

1. 💃 **Dance** — camera ke samne ~3 second movement
2. 👏 **Taali** — mic se 2 baar taali detect
3. 🗣️ **Hello** — Web Speech API se "hello" bola detect (support na ho to zor ki awaaz se fallback)

## Kaise chalayein

Camera access ke liye browser ko **secure context** chahiye, isliye `index.html` par direct double-click karne se better localhost server use karein:

**Sabse aasan:** `start.bat` par double-click karein — server aur browser apne aap chal jayenge.

Ya manually:

```bash
cd "C:\Users\aman\Desktop\dancing clock"
python -m http.server 8000 --bind 127.0.0.1
```

Phir browser me kholein: **http://127.0.0.1:8000** (`localhost` ki jagah `127.0.0.1` use karein — IPv6 me phansne se bachat hogi).

> Agar "site can't be reached" / reload wala screen aaye to matlab server nahi chal raha — `start.bat` chalayein ya upar wala command dobara run karein. Port 8000 busy ho to command me `8001` badal kar URL bhi `http://127.0.0.1:8001` kar dein.

(VS Code ka "Live Server" extension bhi chalega.)

> Tab khuli rehni chahiye — band kar diya to browser alarm nahi baja sakta.

## Flow

1. Time aur optional label dekar **Alarm set karo** dabayein.
2. Browser tab khula rahe. Alarm time par ringtone + vibration shuru.
3. Full-screen challenge mode aata hai — yahan **koi off/snooze button nahi** hai.
4. **Step 1:** Camera frame-difference se movement detect hoti hai (~3 sec). Poora hote hi step 2 active.
5. **Step 2:** Mic se 2 baar taali detect hoti hai (sharp high-frequency spikes).
6. **Step 3:** Web Speech API se "hello" suna jata hai. Speech support na ho to 80-400 Hz voice band se fallback.
7. Camera permission na mile to step 1 automatically mic fallback par chal jata hai. Mic na mile to retry buttons dikhte hain. Chrome/Edge me speech recognition best chaleta hai.
8. **Reload se bachne se bachao:** ring state aur dance progress `localStorage` me save hota hai. Reload karne par alarm wapas aa jayega (sound ke liye ek baar click karna padega), aur tab close/reload par browser ka confirmation prompt dikhega. Browser ka reload button remove karna technically possible nahi hai — lekin reload karne ka koi fayda nahi. Storage manually clear karne se ye protection khatam ho jayegi.

## Files

| File | Kaam |
| --- | --- |
| `index.html` | Clock, alarm form aur ring overlay UI |
| `styles.css` | Neon dance theme aur animations |
| `motion.js` | Detection engine: `MotionDetector` (camera frame-diff), `MicMonitor` (clap/voice), `SpeechDetector` ("hello") |
| `app.js` | Alarm scheduling, countdown, Web Audio ringtone, 3-step challenge + reload protection |

## Tuning

- `app.js` me `REQUIRED_ENERGY = 3` → dance karne ka required time (seconds).
- `app.js` me `level > 0.2` threshold → kitni movement "dance" maani jayegi.
- `motion.js` me `(meanDiff - 2) / 14` → camera sensitivity (kam number = zyada sensitive).
- `app.js` me `CLAPS_REQUIRED = 2` → kitni taaliyan chahiye.
- `motion.js` me clap threshold (`0.13`, `baseline * 2.1`) → taali sensitivity.
- `app.js` me `MELODY` → apni ringtone ke notes.

Steps badalna ho to `app.js` me `startStep(index)` aur `index.html` me `#stepsList` edit karein — naya step add karna easy hai.

## Baad me app ke liye

Detection logic `motion.js` me alag hai, isliye same "level → energy → dismiss" pattern React Native / Flutter me port karna aasan hoga. Mobile par camera frame-diff ya accelerometer se yahi level banana hoga; `app.js` ki alarm/ringtone logic UI layer se replace kar sakte hain.
