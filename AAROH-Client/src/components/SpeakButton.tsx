import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isSpeechAvailable, speak, stopSpeaking } from '@/lib/speech';

import { Button } from './Button';

/**
 * "Listen in Hindi" control for the recommendation screen (M7). Renders nothing when the
 * optional TTS module isn't in the build, so the screen degrades cleanly to text-only.
 * The parent builds the spoken summary string; this just plays/stops it.
 */
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const [speaking, setSpeaking] = useState(false);

  // Stop any playback if the screen unmounts mid-sentence.
  useEffect(() => () => stopSpeaking(), []);

  if (!isSpeechAvailable() || !text) return null;

  const onPress = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const started = speak(text, i18n.language, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
    });
    if (started) setSpeaking(true);
  };

  return (
    <Button
      variant="secondary"
      icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
      label={speaking ? t('recommendation.stop') : t('recommendation.listen')}
      onPress={onPress}
      className={className}
    />
  );
}
