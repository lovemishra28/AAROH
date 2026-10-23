/**
 * Hindi text-to-speech (M7) — the "listen to your advice" affordance for low-literacy users.
 *
 * TTS uses the native `expo-speech` module. It is included explicitly so Metro and the
 * development client both resolve the module consistently.
 *
 * ── To enable audio ──────────────────────────────────────────────────────────
 *   Rebuild the dev client after installing the package: `npx expo run:android`
 * ─────────────────────────────────────────────────────────────────────────────
 */

type SpeakOptions = {
  language?: string;
  rate?: number;
  pitch?: number;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: () => void;
};

type SpeechModule = {
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
};

import * as StaticSpeech from 'expo-speech';

function load(): SpeechModule | null {
  return StaticSpeech as unknown as SpeechModule;
}

export function isSpeechAvailable(): boolean {
  return load() != null;
}

/** Speak a phrase in the given UI language. Returns false if TTS isn't available. */
export function speak(
  text: string,
  lang: string,
  callbacks?: { onDone?: () => void; onStopped?: () => void },
): boolean {
  const mod = load();
  if (!mod) return false;
  try {
    mod.stop();
    mod.speak(text, {
      language: lang === 'hi' ? 'hi-IN' : 'en-IN',
      rate: 0.92,
      pitch: 1.0,
      onDone: callbacks?.onDone,
      onStopped: callbacks?.onStopped,
      onError: callbacks?.onStopped,
    });
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  try {
    load()?.stop();
  } catch {
    // ignore
  }
}
