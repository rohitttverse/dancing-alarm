/*
 * motion.js — dance detection engine.
 * Detects "any movement" using the camera (frame difference).
 * Falls back to the microphone (sound level) if camera access is unavailable.
 * Reports a normalized level between 0 and 1 via onLevel(level).
 */
(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  class MotionDetector {
    constructor(videoElement) {
      this.video = videoElement;
      this.stream = null;
      this.audioCtx = null;
      this.analyser = null;
      this.audioData = null;
      this.mode = null;
      this.running = false;
      this.rafId = null;
      this.lastSampleAt = 0;
      this.sampleCount = 0;
      this.previousFrame = null;
      this.onLevel = null;

      this.canvas = document.createElement('canvas');
      this.canvas.width = 64;
      this.canvas.height = 48;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    /* Tries camera first, then mic. Returns 'camera' | 'mic' | 'none'. */
    async start(onLevel, options) {
      const opts = options || {};
      const preferMic = !!opts.preferMic;
      const allowMicFallback = opts.allowMicFallback !== false;

      this.stop();
      this.onLevel = onLevel;

      if (!preferMic && global.navigator.mediaDevices && global.navigator.mediaDevices.getUserMedia) {
        try {
          await this.startCamera();
          return 'camera';
        } catch (cameraError) {
          console.warn('Camera unavailable:', cameraError && cameraError.name);
        }
      }

      if (preferMic || allowMicFallback) {
        try {
          await this.startMic();
          return 'mic';
        } catch (micError) {
          console.warn('Mic unavailable:', micError && micError.name);
        }
      }

      return 'none';
    }

    async startCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.mode = 'camera';
      this.running = true;
      this.previousFrame = null;
      this.resetSampling();
      this.loop();
    }

    async startMic() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        throw new Error('Web Audio not supported');
      }

      const audioCtx = new AudioCtx();
      await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      this.stream = stream;
      this.audioCtx = audioCtx;
      this.analyser = analyser;
      this.audioData = new Uint8Array(analyser.frequencyBinCount);
      this.mode = 'mic';
      this.running = true;
      this.resetSampling();
      this.loop();
    }

    resetSampling() {
      this.lastSampleAt = 0;
      this.sampleCount = 0;
    }

    loop() {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(this.loop.bind(this));

      const now = performance.now();
      if (this.lastSampleAt && now - this.lastSampleAt < 80) return;
      this.lastSampleAt = now;

      let level = 0;
      if (this.mode === 'camera') level = this.sampleCamera();
      else if (this.mode === 'mic') level = this.sampleMic();

      // Give the sensor a short warm-up (auto exposure / mic start).
      this.sampleCount += 1;
      if (this.sampleCount < 4 || !this.onLevel) return;
      this.onLevel(level);
    }

    sampleCamera() {
      if (!this.video.videoWidth) return 0;
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const current = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      let level = 0;

      if (this.previousFrame) {
        let diffSum = 0;
        for (let i = 0; i < current.length; i += 4) {
          diffSum += Math.abs(current[i] - this.previousFrame[i]);
          diffSum += Math.abs(current[i + 1] - this.previousFrame[i + 1]);
          diffSum += Math.abs(current[i + 2] - this.previousFrame[i + 2]);
        }
        const meanDiff = diffSum / (this.canvas.width * this.canvas.height * 3);
        level = clamp((meanDiff - 2) / 14, 0, 1);
      }

      this.previousFrame = new Uint8ClampedArray(current);
      return level;
    }

    sampleMic() {
      // Only listen to high frequencies so the ringtone itself cannot
      // satisfy the detector (claps / footsteps / loud dance noise can).
      this.analyser.getByteFrequencyData(this.audioData);
      const data = this.audioData;
      const nyquist = this.audioCtx.sampleRate / 2;
      const from = Math.max(0, Math.floor((3000 / nyquist) * data.length));
      const to = Math.min(data.length, Math.ceil((9000 / nyquist) * data.length));
      if (to <= from) return 0;

      let sum = 0;
      for (let i = from; i < to; i += 1) sum += data[i];
      const average = sum / (to - from) / 255;
      return clamp((average - 0.06) / 0.34, 0, 1);
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.stream) {
        this.stream.getTracks().forEach(function (track) { track.stop(); });
        this.stream = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(function () {});
        this.audioCtx = null;
      }
      this.analyser = null;
      this.audioData = null;
      this.mode = null;
      this.previousFrame = null;
      if (this.video) this.video.srcObject = null;
    }
  }

  /* Clap (sharp sound spike) ya voice (sustained sound) detect karta hai. */
  class MicMonitor {
    constructor(kind) {
      this.kind = kind; // 'clap' | 'voice'
      this.stream = null;
      this.audioCtx = null;
      this.analyser = null;
      this.freqData = null;
      this.timeData = null;
      this.running = false;
      this.rafId = null;
      this.callback = null;
      this.baseline = 0;
      this.lastClapAt = 0;
      this.lastTick = 0;
      this.warmup = 0;
      this.voiceEnergy = 0;
    }

    async start(callback) {
      this.stop();
      this.callback = callback;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false
        });
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio not supported');
        const audioCtx = new AudioCtx();
        await audioCtx.resume();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0; // clap transients matter

        audioCtx.createMediaStreamSource(stream).connect(analyser);
        this.stream = stream;
        this.audioCtx = audioCtx;
        this.analyser = analyser;
        this.freqData = new Uint8Array(analyser.frequencyBinCount);
        this.timeData = new Uint8Array(analyser.fftSize);
        this.running = true;
        this.baseline = 0;
        this.lastClapAt = 0;
        this.lastTick = 0;
        this.warmup = 0;
        this.voiceEnergy = 0;
        this.loop();
        return true;
      } catch (error) {
        console.warn('MicMonitor unavailable:', error && error.name);
        this.stop();
        return false;
      }
    }

    loop() {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(this.loop.bind(this));

      const now = performance.now();
      if (this.lastTick && now - this.lastTick < 25) return;
      const dt = this.lastTick ? Math.min((now - this.lastTick) / 1000, 0.2) : 0;
      this.lastTick = now;
      this.warmup += 1;
      if (this.warmup < 5 || !this.callback) return;

      // High frequency band: claps are sharp here, ringtone notes are not.
      this.analyser.getByteFrequencyData(this.freqData);
      const nyquist = this.audioCtx.sampleRate / 2;
      const from = Math.max(0, Math.floor((2500 / nyquist) * this.freqData.length));
      const to = Math.min(this.freqData.length, Math.ceil((10000 / nyquist) * this.freqData.length));
      let sum = 0;
      for (let i = from; i < to; i += 1) sum += this.freqData[i];
      const high = to > from ? sum / (to - from) / 255 : 0;

      if (this.kind === 'clap') {
        const threshold = Math.max(0.13, this.baseline * 2.1);
        if (high > threshold && now - this.lastClapAt > 280) {
          this.lastClapAt = now;
          this.callback();
        }
        this.baseline = this.baseline * 0.9 + high * 0.1;
      } else {
        // Voice band 80-400 Hz — ringtone notes (523 Hz+) ignore ho jate hain.
        const lowFrom = Math.max(0, Math.floor((80 / nyquist) * this.freqData.length));
        const lowTo = Math.min(this.freqData.length, Math.ceil((400 / nyquist) * this.freqData.length));
        let lowSum = 0;
        for (let i = lowFrom; i < lowTo; i += 1) lowSum += this.freqData[i];
        const lowAvg = lowTo > lowFrom ? lowSum / (lowTo - lowFrom) / 255 : 0;
        const level = clamp((lowAvg - 0.05) / 0.25, 0, 1);
        if (level > 0.35) this.voiceEnergy += dt * 1.4;
        else this.voiceEnergy -= dt;
        this.voiceEnergy = clamp(this.voiceEnergy, 0, 1);
        this.callback(this.voiceEnergy);
      }
    }

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      if (this.stream) {
        this.stream.getTracks().forEach(function (track) { track.stop(); });
        this.stream = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(function () {});
        this.audioCtx = null;
      }
      this.analyser = null;
      this.freqData = null;
      this.timeData = null;
      this.callback = null;
    }
  }

  /* "Hello" sunne ke liye Web Speech API. Support na ho to null deta hai. */
  class SpeechDetector {
    constructor() {
      this.recognition = null;
      this.running = false;
    }

    start(onHeard) {
      const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (!SR) return false;
      const self = this;
      try {
        const rec = new SR();
        rec.lang = 'hi-IN';
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 3;
        rec.onresult = function (event) {
          for (let i = 0; i < event.results.length; i += 1) {
            const text = String(event.results[i][0].transcript || '').toLowerCase();
            if (/hello|हेलो|हैलो|hellow|hallo/.test(text)) {
              onHeard(text);
              return;
            }
          }
        };
        rec.onerror = function (event) {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') self.running = false;
        };
        rec.onend = function () {
          if (!self.running) return;
          setTimeout(function () {
            if (!self.running) return;
            try { rec.start(); } catch (e) { /* ignore */ }
          }, 350);
        };
        rec.start();
        this.recognition = rec;
        this.running = true;
        return true;
      } catch (error) {
        console.warn('SpeechRecognition unavailable:', error && error.name);
        return false;
      }
    }

    stop() {
      this.running = false;
      const rec = this.recognition;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try { rec.stop(); } catch (e) { /* ignore */ }
      }
      this.recognition = null;
    }
  }

  global.MotionDetector = MotionDetector;
  global.MicMonitor = MicMonitor;
  global.SpeechDetector = SpeechDetector;
})(window);
