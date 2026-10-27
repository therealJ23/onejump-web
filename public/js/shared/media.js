// Camera and microphone helpers for the browser. Everything is push-to-act: nothing records or
// opens the camera until the person taps, and recording stops on its own at the time limit.
export const MIC_OFF = 'Microphone access is off. Turn it on in your browser settings to use voice.';
export const CAMERA_OFF = 'Camera access is off. Turn it on in your browser settings, or type the barcode instead.';

/**
 * Resizes a photo to at most `max` px on the long edge and re-encodes it as JPEG. Re-encoding
 * through a canvas drops EXIF metadata, including GPS location, before anything is uploaded.
 * @returns {Promise<Blob>}
 */
export async function resizeToJpeg(file, max = 1024, quality = 0.8) {
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
  catch {
    src = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('That photo couldn’t be opened. Try another one.')); img.src = URL.createObjectURL(file); });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('That photo couldn’t be prepared. Try again.'))), 'image/jpeg', quality));
}

export const recordingSupported = typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
if (typeof document !== 'undefined' && !recordingSupported) document.documentElement.classList.add('no-rec');

function pickMime() {
  // MP4/AAC first where the browser can (Safari): it plays everywhere, the iPhone app included.
  for (const t of ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  return '';
}

/**
 * Push-to-talk recorder with a level meter. await start() (asks for the microphone the first
 * time), then stop() resolves with the audio. It also stops itself at maxMs.
 * onLevel(0..1) is called about 30 times a second while recording.
 */
export function createRecorder({ maxMs = 30000, onLevel, onAutoStop } = {}) {
  let stream, rec, chunks = [], ctx, raf, timer, startedAt = 0, resolveStop;
  const cleanup = () => { cancelAnimationFrame(raf); clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); ctx?.close().catch(() => {}); stream = null; };
  return {
    get recording() { return rec?.state === 'recording'; },
    async start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { const err = new Error(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? MIC_OFF : 'No microphone was found. You can type instead.'); err.code = e?.name === 'NotAllowedError' ? 'denied' : 'nomic'; throw err; }
      const mimeType = pickMime();
      rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
      chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise(r => { resolveStop = r; });
      rec.onstop = () => { const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }); cleanup(); resolveStop({ blob, durationMs: Date.now() - startedAt, mimeType: blob.type }); };
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => { an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128)); onLevel?.(Math.min(1, peak / 64)); raf = requestAnimationFrame(tick); };
        tick();
      } catch { /* level meter is optional */ }
      rec.start(250);
      startedAt = Date.now();
      timer = setTimeout(() => { if (rec.state === 'recording') { onAutoStop?.(); if (rec.state === 'recording') rec.stop(); } }, maxMs);
      this.done = done;
      return true; // recording has started; stop() resolves with { blob, durationMs, mimeType }
    },
    stop() { if (rec?.state === 'recording') rec.stop(); return this.done; },
    cancel() { if (rec?.state === 'recording') { rec.onstop = () => cleanup(); rec.stop(); } else cleanup(); },
  };
}

/** Draws a live level meter into a .wave element with <i> bars. */
export function meter(wave) {
  const bars = [...wave.querySelectorAll('i')];
  return level => bars.forEach((b, i) => { const k = 1 - Math.abs(i - (bars.length - 1) / 2) / bars.length; b.style.height = `${5 + Math.round(level * 26 * (0.5 + k))}px`; });
}

// ---------------------------------------------------------------- barcode scanning
let zxing = null;
async function loadZxing() {
  if (window.ZXingBrowser) return window.ZXingBrowser;
  if (!zxing) zxing = new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = '/vendor/zxing-browser.min.js'; s.onload = () => resolve(window.ZXingBrowser); s.onerror = () => reject(new Error('The scanner couldn’t load. Type the barcode instead.')); document.head.appendChild(s); });
  return zxing;
}
/**
 * Scans a barcode with the camera: the browser's BarcodeDetector where available (Chrome,
 * Android), otherwise the ZXing library (iPhone Safari). Resolves with the digits.
 * @returns {{ result: Promise<string>, stop: () => void }}
 */
export function scanBarcode(video) {
  let stopped = false, stream = null, controls = null;
  const stop = () => { stopped = true; controls?.stop?.(); stream?.getTracks().forEach(t => t.stop()); };
  const result = (async () => {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || [];
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(f => !formats.length || formats.includes(f));
      if (want.length) {
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { throw Object.assign(new Error(e?.name === 'NotAllowedError' ? CAMERA_OFF : 'No camera was found. Type the barcode instead.'), { code: 'camera' }); }
        video.srcObject = stream; await video.play().catch(() => {});
        const det = new window.BarcodeDetector({ formats: want });
        while (!stopped) {
          const codes = await det.detect(video).catch(() => []);
          if (codes[0]?.rawValue) { stop(); return codes[0].rawValue; }
          await new Promise(r => setTimeout(r, 180));
        }
        throw Object.assign(new Error('Stopped'), { code: 'stopped' });
      }
    }
    const Z = await loadZxing();
    const reader = new Z.BrowserMultiFormatReader();
    return new Promise((resolve, reject) => {
      reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res, _err, ctl) => { controls = ctl; if (res && !stopped) { stop(); resolve(res.getText()); } })
        .then(ctl => { controls = ctl; if (stopped) ctl.stop(); })
        .catch(e => reject(Object.assign(new Error(e?.name === 'NotAllowedError' ? CAMERA_OFF : 'The camera couldn’t start. Type the barcode instead.'), { code: 'camera' })));
    });
  })();
  return { result, stop };
}
