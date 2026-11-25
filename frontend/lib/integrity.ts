// Focus / integrity monitoring. Runs 100% in the browser: video frames never leave the device.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export type FaceState = 'ok' | 'none' | 'multi' | 'away';

const STATE_LABEL: Record<FaceState, string> = {
  ok: '✅ Face detected, focused',
  none: '⚠️ No face visible',
  multi: '⚠️ Multiple people',
  away: '👀 Looking away',
};

const RULES: Record<Exclude<FaceState, 'ok'>, { msg: string; penalty: number; afterMs: number }> = {
  none: { msg: 'No face visible', penalty: 8, afterMs: 3000 },
  multi: { msg: 'More than one person detected', penalty: 15, afterMs: 1500 },
  away: { msg: 'Looking away from screen', penalty: 4, afterMs: 3000 },
};

/**
 * Starts face monitoring plus tab-switch detection.
 * Returns a stop() function.
 */
export function startMonitor(
  video: HTMLVideoElement,
  onLabel: (label: string) => void,
  onFlag: (msg: string, penalty: number) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const onVis = () => document.hidden && onFlag('Switched tab / minimized window', 10);
  const onBlur = () => !document.hidden && onFlag('Left the interview window', 5);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);

  (async () => {
    let detector: any;
    try {
      // Loaded from CDN at runtime (not bundled) to keep the Next.js build small.
      const mp: any = await import(/* webpackIgnore: true */ `${MP_BASE}/vision_bundle.mjs`);
      const files = await mp.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      detector = await mp.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
    } catch {
      onLabel('Face monitor unavailable (tab-switch tracking still on).');
      return;
    }
    if (stopped) return;

    const since: Record<string, number> = { none: 0, multi: 0, away: 0 };
    const flagged: Record<string, boolean> = { none: false, multi: false, away: false };

    timer = setInterval(() => {
      if (stopped || video.readyState < 2) return;
      let dets: any[];
      try {
        dets = detector.detectForVideo(video, performance.now()).detections;
      } catch {
        return;
      }
      let state: FaceState = 'ok';
      if (dets.length === 0) state = 'none';
      else if (dets.length > 1) state = 'multi';
      else {
        // Head-turn estimate: where the nose sits between the two eyes.
        const kp = dets[0].keypoints;
        if (kp?.length >= 3) {
          const lo = Math.min(kp[0].x, kp[1].x);
          const hi = Math.max(kp[0].x, kp[1].x);
          const rel = (kp[2].x - lo) / Math.max(hi - lo, 1e-6);
          if (rel < 0.1 || rel > 0.9) state = 'away';
        }
      }
      const now = Date.now();
      for (const k of Object.keys(RULES) as (keyof typeof RULES)[]) {
        if (state === k) {
          if (!since[k]) since[k] = now;
          if (!flagged[k] && now - since[k] > RULES[k].afterMs) {
            flagged[k] = true;
            onFlag(RULES[k].msg, RULES[k].penalty);
          }
        } else {
          since[k] = 0;
          flagged[k] = false;
        }
      }
      onLabel(STATE_LABEL[state]);
    }, 400);
  })();

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
  };
}
