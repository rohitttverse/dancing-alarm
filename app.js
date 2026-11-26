/* Dancing Clock — 3-step alarm: dance, clap, hello. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    digital: $('digitalClock'), date: $('todayDate'),
    hourHand: $('hourHand'), minuteHand: $('minuteHand'), secondHand: $('secondHand'),
    form: $('alarmForm'), time: $('alarmTime'), label: $('alarmLabel'),
    status: $('alarmStatus'), countdown: $('countdown'),
    cancelBtn: $('cancelBtn'), testBtn: $('testSoundBtn'),
    overlay: $('ringOverlay'), ringLabel: $('ringLabel'),
    steps: Array.prototype.slice.call(document.querySelectorAll('#stepsList li')),
    stepTitle: $('stepTitle'),
    video: $('danceCamera'), cameraMessage: $('cameraMessage'), cameraTag: $('cameraTag'),
    energyFill: $('energyFill'), energyPercent: $('energyPercent'), hint: $('danceHint'),
    retryBtn: $('retryCameraBtn'), micBtn: $('useMicBtn'),
    toast: $('toast')
  };

  var STEP_DANCE = 0;
  var STEP_CLAP = 1;
  var STEP_HELLO = 2;
  var REQUIRED_ENERGY = 3;   // ~3 seconds of real movement
  var CLAPS_REQUIRED = 2;
  var STORAGE_KEY = 'dancing-clock-alarm';
  var RING_KEY = 'dancing-clock-ringing';
  var MELODY = [659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 523.25, 587.33];

  var state = {
    target: null,
    label: '',
    ringing: false,
    stepIndex: STEP_DANCE,
    energy: 0,
    claps: 0,
    helloProgress: 0,
    lastEnergyTick: 0,
    lastPersistAt: 0,
    detector: null,
    clapMonitor: null,
    voiceMonitor: null,
    speech: null,
    audioCtx: null,
    noteTimer: null,
    noteIndex: 0,
    vibeTimer: null,
    ringTimeout: null,
    toastTimer: null,
    testTimers: []
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function unlockAudio() {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!state.audioCtx) state.audioCtx = new AudioCtx();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(function () {});
  }

  function playNote(freq) {
    if (!state.audioCtx) return;
    var ctx = state.audioCtx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var now = ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  function startRingtone() {
    unlockAudio();
    stopRingtone();
    state.noteIndex = 0;
    playNote(MELODY[0]);
    state.noteTimer = setInterval(function () {
      state.noteIndex = (state.noteIndex + 1) % MELODY.length;
      playNote(MELODY[state.noteIndex]);
    }, 340);
    if (navigator.vibrate) {
      state.vibeTimer = setInterval(function () { navigator.vibrate([180, 120, 180]); }, 1400);
      navigator.vibrate([180, 120, 180]);
    }
  }

  function stopRingtone() {
    if (state.noteTimer) clearInterval(state.noteTimer);
    if (state.vibeTimer) clearInterval(state.vibeTimer);
    state.noteTimer = null;
    state.vibeTimer = null;
    if (navigator.vibrate) navigator.vibrate(0);
  }

  function updateClock() {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
    els.digital.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    els.date.textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
    els.hourHand.style.transform = 'rotate(' + ((h % 12) * 30 + m * 0.5) + 'deg)';
    els.minuteHand.style.transform = 'rotate(' + (m * 6 + s * 0.1) + 'deg)';
    els.secondHand.style.transform = 'rotate(' + (s * 6 + ms * 0.006) + 'deg)';

    if (state.target && !state.ringing) {
      var remaining = Math.max(0, state.target - Date.now());
      var totalSec = Math.ceil(remaining / 1000);
      els.countdown.textContent = pad(Math.floor(totalSec / 3600)) + ':' +
        pad(Math.floor((totalSec % 3600) / 60)) + ':' + pad(totalSec % 60);
      if (remaining <= 0) ring();
    } else if (!state.target) {
      els.countdown.textContent = '--:--:--';
    }
  }

  function renderAlarmStatus() {
    if (!state.target) {
      els.status.textContent = 'No alarm set yet.';
      els.cancelBtn.hidden = true;
      return;
    }
    var time = new Date(state.target);
    var when = time.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    els.status.textContent = 'Alarm active: ' + pad(time.getHours()) + ':' + pad(time.getMinutes()) +
      ' (' + when + ')' + (state.label ? ' — ' + state.label : '');
    els.cancelBtn.hidden = false;
  }

  function saveAlarm() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ target: state.target, label: state.label }));
    } catch (e) { /* storage blocked — app still works */ }
  }

  function clearAlarm() {
    state.target = null;
    state.label = '';
    if (state.ringTimeout) clearTimeout(state.ringTimeout);
    state.ringTimeout = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    renderAlarmStatus();
  }

  function loadAlarm() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && saved.target && saved.target > Date.now()) {
        state.target = saved.target;
        state.label = saved.label || '';
      }
    } catch (e) { /* ignore bad storage */ }
    renderAlarmStatus();
  }

  function showToast(message) {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    state.toastTimer = setTimeout(function () { els.toast.hidden = true; }, 3200);
  }

  function persistRinging() {
    try {
      localStorage.setItem(RING_KEY, JSON.stringify({
        label: state.label,
        stepIndex: state.stepIndex,
        energy: state.energy,
        claps: state.claps,
        helloProgress: state.helloProgress,
        savedAt: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }

  function loadRinging() {
    try {
      var pending = JSON.parse(localStorage.getItem(RING_KEY) || 'null');
      if (pending && pending.savedAt && Date.now() - pending.savedAt < 86400000) {
        state.label = pending.label || '';
        state.stepIndex = clamp(Number(pending.stepIndex) || 0, 0, STEP_HELLO);
        state.energy = clamp(Number(pending.energy) || 0, 0, REQUIRED_ENERGY);
        state.claps = clamp(Number(pending.claps) || 0, 0, CLAPS_REQUIRED);
        state.helloProgress = clamp(Number(pending.helloProgress) || 0, 0, 1);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function renderSteps() {
    els.steps.forEach(function (li, index) {
      li.classList.toggle('active', state.ringing && index === state.stepIndex);
      li.classList.toggle('done', state.ringing && index < state.stepIndex);
      var check = li.querySelector('.step-check');
      if (check) check.textContent = index < state.stepIndex ? '✓' : '';
    });
  }

  function updateEnergyUI() {
    var progress;
    if (state.stepIndex === STEP_DANCE) progress = state.energy / REQUIRED_ENERGY;
    else if (state.stepIndex === STEP_CLAP) progress = state.claps / CLAPS_REQUIRED;
    else progress = state.helloProgress;
    var pct = Math.round(clamp(progress, 0, 1) * 100);
    els.energyFill.style.width = pct + '%';
    els.energyPercent.textContent = pct + '%';
  }

  function stopCurrentDetector() {
    if (state.detector) { state.detector.stop(); state.detector = null; }
    if (state.clapMonitor) { state.clapMonitor.stop(); state.clapMonitor = null; }
    if (state.voiceMonitor) { state.voiceMonitor.stop(); state.voiceMonitor = null; }
    if (state.speech) { state.speech.stop(); state.speech = null; }
  }

  function applyDetectionMode(mode) {
    if (state.stepIndex !== STEP_DANCE) return;
    if (mode === 'camera') {
      els.video.hidden = false;
      els.cameraMessage.hidden = true;
      els.cameraTag.textContent = '📷 CAMERA ON';
      els.retryBtn.hidden = true;
      els.micBtn.hidden = true;
    } else if (mode === 'mic') {
      els.video.hidden = true;
      els.cameraMessage.hidden = false;
      els.cameraMessage.textContent = 'MIC MODE 🎤';
      els.cameraTag.textContent = '🎤 MIC ON';
      els.retryBtn.hidden = false;
      els.micBtn.hidden = true;
    } else {
      showMicError('Camera / microphone blocked');
    }
  }

  function showMicError(message) {
    els.video.hidden = true;
    els.cameraMessage.hidden = false;
    els.cameraMessage.textContent = message || 'Microphone access denied';
    els.cameraTag.textContent = '🚫 SENSOR OFF';
    els.hint.textContent = 'Allow microphone access in your browser, then retry.';
    els.retryBtn.hidden = false;
    els.micBtn.hidden = true;
  }

  /* Step 1: movement detection with the camera. */
  function startDetection(options) {
    state.lastEnergyTick = 0;
    updateEnergyUI();
    var detector = new MotionDetector(els.video);
    state.detector = detector;
    detector.start(function (level) {
      if (!state.ringing || state.stepIndex !== STEP_DANCE) return;
      var now = performance.now();
      var dt = state.lastEnergyTick ? Math.min((now - state.lastEnergyTick) / 1000, 0.25) : 0;
      state.lastEnergyTick = now;

      if (level > 0.2) state.energy += dt * (0.6 + level);
      else state.energy -= dt * 0.5;
      state.energy = clamp(state.energy, 0, REQUIRED_ENERGY);
      updateEnergyUI();

      if (now - state.lastPersistAt > 400) {
        state.lastPersistAt = now;
        persistRinging();
      }
      if (state.energy >= REQUIRED_ENERGY) completeStep();
    }, options || {}).then(function (mode) {
      if (state.ringing && state.stepIndex === STEP_DANCE) applyDetectionMode(mode);
    });
  }

  function onClap() {
    if (!state.ringing || state.stepIndex !== STEP_CLAP) return;
    state.claps = Math.min(CLAPS_REQUIRED, state.claps + 1);
    updateEnergyUI();
    persistRinging();
    els.hint.textContent = state.claps >= CLAPS_REQUIRED
      ? 'Nice! Next step: say "hello" 🗣️'
      : 'One more clap (' + state.claps + '/' + CLAPS_REQUIRED + ') 👏';
    if (state.claps >= CLAPS_REQUIRED) setTimeout(completeStep, 400);
  }

  function onHello() {
    if (!state.ringing || state.stepIndex !== STEP_HELLO) return;
    state.helloProgress = 1;
    updateEnergyUI();
    persistRinging();
    els.hint.textContent = 'Hello detected! 🎉';
    setTimeout(dismissAlarm, 400);
  }

  function startStep(index) {
    if (!state.ringing) return;
    stopCurrentDetector();
    state.stepIndex = index;
    state.lastEnergyTick = 0;
    els.retryBtn.hidden = true;
    els.micBtn.hidden = true;
    renderSteps();
    updateEnergyUI();

    if (index === STEP_DANCE) {
      els.stepTitle.textContent = 'Dance energy ⚡';
      els.hint.textContent = 'Move in front of the camera for ~3 seconds — step 1/3 💃';
      startDetection();
      return;
    }

    els.video.hidden = true;
    els.cameraMessage.hidden = false;
    els.cameraMessage.textContent = 'MIC MODE 🎤';
    els.cameraTag.textContent = '🎤 MIC ON';

    if (index === STEP_CLAP) {
      els.stepTitle.textContent = 'Clap count 👏';
      els.hint.textContent = 'Clap twice (' + state.claps + '/' + CLAPS_REQUIRED + ') — step 2/3';
      var clapMonitor = new MicMonitor('clap');
      state.clapMonitor = clapMonitor;
      clapMonitor.start(onClap).then(function (ok) {
        if (!ok && state.ringing && state.stepIndex === STEP_CLAP) showMicError();
      });
      return;
    }

    els.stepTitle.textContent = 'Hello check 🗣️';
    els.hint.textContent = 'Say "hello" — I am listening! (step 3/3)';
    var speech = new SpeechDetector();
    state.speech = speech;
    var speechOk = false;
    try { speechOk = speech.start(onHello); } catch (e) { speechOk = false; }
    if (!speechOk) els.hint.textContent = 'Speech recognition unavailable — say "hello" loudly 🎤';

    var voiceMonitor = new MicMonitor('voice');
    state.voiceMonitor = voiceMonitor;
    voiceMonitor.start(function (progress) {
      if (!state.ringing || state.stepIndex !== STEP_HELLO) return;
      state.helloProgress = clamp(progress, 0, 1);
      updateEnergyUI();
      if (state.helloProgress >= 1) onHello();
    }).then(function (ok) {
      if (!ok && !speechOk && state.ringing && state.stepIndex === STEP_HELLO) showMicError();
    });
  }

  function completeStep() {
    if (!state.ringing) return;
    if (state.stepIndex >= STEP_HELLO) {
      dismissAlarm();
      return;
    }
    var next = state.stepIndex + 1;
    showToast(next === STEP_CLAP ? 'Step 1 done! Now clap twice 👏' : 'Claps done! Now say "hello" 🗣️');
    persistRinging();
    startStep(next);
  }

  function ring(restored) {
    if (state.ringing || (!state.target && !restored)) return;
    state.ringing = true;
    if (!restored) {
      state.stepIndex = STEP_DANCE;
      state.energy = 0;
      state.claps = 0;
      state.helloProgress = 0;
    }
    state.lastEnergyTick = 0;
    state.lastPersistAt = 0;
    els.ringLabel.textContent = state.label ? 'WAKE UP! ' + state.label : 'WAKE UP! 💃';
    els.overlay.hidden = false;
    renderSteps();
    persistRinging();
    startStep(state.stepIndex);

    if (restored) {
      // Browsers block autoplay after reload; first click/tap starts the sound.
      els.hint.textContent = 'Click or tap once to enable sound, then follow the steps! 💃';
    } else {
      startRingtone();
    }
  }

  function dismissAlarm() {
    if (!state.ringing) return;
    state.ringing = false;
    stopRingtone();
    stopCurrentDetector();
    els.steps.forEach(function (li) { li.classList.add('done'); li.classList.remove('active'); });
    els.overlay.hidden = true;
    try { localStorage.removeItem(RING_KEY); } catch (e) {}
    clearAlarm();
    showToast('🎉 Alarm off! All 3 steps complete — reward unlocked.');
  }

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!els.time.value) return;
    var parts = els.time.value.split(':');
    var hour = Number(parts[0]);
    var minute = Number(parts[1]);
    var now = new Date();
    var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    state.target = target.getTime();
    state.label = els.label.value.trim();
    if (state.ringTimeout) clearTimeout(state.ringTimeout);
    state.ringTimeout = setTimeout(ring, Math.max(0, state.target - Date.now()));
    saveAlarm();
    renderAlarmStatus();
    unlockAudio(); // user gesture unlocks sound for later
    showToast('Alarm set! 3 steps: dance → clap → hello 💃');
  });

  els.cancelBtn.addEventListener('click', function () {
    clearAlarm();
    showToast('Alarm cancelled.');
  });

  els.testBtn.addEventListener('click', function () {
    unlockAudio();
    state.testTimers.forEach(clearTimeout);
    state.testTimers = [];
    MELODY.forEach(function (freq, index) {
      state.testTimers.push(setTimeout(function () { playNote(freq); }, index * 180));
    });
  });

  els.retryBtn.addEventListener('click', function () {
    if (!state.ringing) return;
    if (state.stepIndex === STEP_DANCE) startDetection({ allowMicFallback: false });
    else startStep(state.stepIndex);
  });

  els.micBtn.addEventListener('click', function () {
    if (!state.ringing) return;
    if (state.stepIndex === STEP_DANCE) startDetection({ preferMic: true });
    else startStep(state.stepIndex);
  });

  loadAlarm();
  updateClock();
  setInterval(updateClock, 200);

  // Reload cannot bypass the alarm; it comes back with the saved progress.
  if (loadRinging()) {
    ring(true);
    showToast('Alarm is still ringing! Follow the steps. 💃');
  }

  // Ask the browser to show its confirmation prompt before closing/reloading.
  window.addEventListener('beforeunload', function (event) {
    if (!state.ringing) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Browsers block autoplay after reload — resume sound on the first gesture.
  function resumeSoundOnGesture() {
    if (!state.ringing) return;
    unlockAudio();
    if (!state.noteTimer) startRingtone();
  }
  document.addEventListener('pointerdown', resumeSoundOnGesture, true);
  document.addEventListener('keydown', resumeSoundOnGesture, true);
})();
