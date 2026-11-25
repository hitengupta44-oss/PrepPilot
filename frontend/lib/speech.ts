// Browser speech: text-to-speech for questions, live speech-to-text for answers.
// In Chrome/Edge, SpeechRecognition uses Google's free speech service.

export const SpeechRecognitionCtor: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = 'en-US';
    ut.rate = 1;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, 4000 + text.length * 90); // fallback if onend never fires
    ut.onend = done;
    ut.onerror = done;
    speechSynthesis.speak(ut);
  });
}

export type Listener = { stop: () => void };

/**
 * Continuous recognition that auto-restarts (Chrome stops after silence).
 * onText receives the full transcript (final + interim) each time it changes.
 */
export function startListening(
  initial: string,
  onText: (full: string, finalPart: string) => void,
  onError: (msg: string) => void,
): Listener | null {
  if (!SpeechRecognitionCtor) return null;
  let active = true;
  let finalText = initial ? initial.trimEnd() + ' ' : '';
  const rec = new SpeechRecognitionCtor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
      else interim += r[0].transcript;
    }
    onText(finalText + interim, finalText);
  };
  rec.onerror = (e: any) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      active = false;
      onError('Microphone blocked: type your answer instead.');
    }
  };
  rec.onend = () => {
    if (active) {
      try { rec.start(); } catch {}
    }
  };
  try { rec.start(); } catch {}
  return {
    stop() {
      active = false;
      try { rec.stop(); } catch {}
    },
  };
}
