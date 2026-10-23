import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, TextInput, View, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { requestOtp, updateMe, verifyOtp } from '@/api/auth';
import { ApiError, NetworkError } from '@/api/client';
import { Button, InfoStrip, Text } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/tokens';
import type { AuthScreenProps } from '@/navigation/types';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export function OtpScreen({ route, navigation }: AuthScreenProps<'Otp'>) {
  const { t } = useTranslation();
  const { phone, devCode, mode, name } = route.params;
  const setSession = useAuthStore((s) => s.setSession);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const verifyMutation = useMutation({
    mutationFn: (fullCode: string) => verifyOtp(phone, fullCode),
    onSuccess: async (result) => {
      await setSession(result, result.farmer);

      // If sign-up captured a name, patch it immediately so the profile is already
      // complete and the RootNavigator name-gate opens the app without an extra step.
      if (mode === 'signup' && name && name.trim()) {
        try {
          const updated = await updateMe({ name: name.trim() });
          useAuthStore.getState().setFarmer(updated.farmer);
        } catch {
          // Non-fatal: if the patch fails, RootNavigator routes to ProfileComplete so the
          // farmer can enter their name there.
        }
      }
      // No navigation here. setSession flips auth status to 'authenticated'; RootNavigator
      // then either opens the app (name present) or shows ProfileComplete (name missing).
    },
    onError: (err) => {
      setCode('');
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setError(t('auth.errOtpVerify'));
      } else if (err instanceof NetworkError) {
        setError(t('health.failed'));
      } else {
        setError(t('auth.errOtpVerify'));
      }
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => requestOtp(phone),
    onSuccess: () => setSecondsLeft(RESEND_SECONDS),
    onError: () => setError(t('auth.errOtpRequest')),
  });

  const submit = (value: string) => {
    if (value.length !== OTP_LENGTH) {
      setError(t('auth.errInvalidCode', { length: OTP_LENGTH }));
      return;
    }
    setError(null);
    verifyMutation.mutate(value);
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === OTP_LENGTH) submit(digits);
  };

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <KeyboardAwareScrollView 
      style={styles.container} 
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={20}
    >
      <View className="items-center pt-16 px-6">
        <Image
          source={require('../../../assets/images/logo.png')}
          style={{ width: 160, height: 50, resizeMode: 'contain' }}
        />
        <Text weight="bold" className="text-3xl text-brand-800 mt-5 text-center">
          Verify Your Number
        </Text>
        <Text className="mt-3 text-body text-ink-muted text-center">
          We have sent a 6-digit OTP to
        </Text>
        
        <View className="flex-row items-center justify-center mt-3">
          <Text weight="bold" className="text-xl text-ink mr-2">
            {phone}
          </Text>
          <Pressable onPress={() => navigation.goBack()} className="p-1">
            <Ionicons name="pencil" size={18} color={colors.brand[700]} />
          </Pressable>
        </View>

        <Image
          source={require('../../../assets/images/farmer-hero.png')}
          style={styles.heroImage}
        />
      </View>

      <View style={styles.bottomCard}>
        <Text weight="bold" className="text-title text-ink-muted text-center mb-6">
          Enter 6-digit OTP
        </Text>

        <Pressable onPress={() => inputRef.current?.focus()}>
          <View className="flex-row justify-center mb-2" style={{ gap: 8 }}>
            {boxes.map((digit, i) => {
              const active = i === code.length;
              return (
                <View
                  key={i}
                  className={`h-14 w-12 items-center justify-center rounded-xl border ${
                    active ? 'border-brand-600 border-2' : digit ? 'border-brand-300 border-2' : 'border-line border'
                  } bg-surface`}
                >
                  <Text weight="semibold" className="text-xl text-ink">
                    {digit}
                  </Text>
                </View>
              );
            })}
          </View>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
            className="absolute h-16 w-full opacity-0"
          />
        </Pressable>

        {error ? <Text className="mt-1 text-center text-sm text-avoid-600">{error}</Text> : null}

        {devCode ? (
          <View className="mt-2">
            <InfoStrip tone="info" text={t('auth.devHint', { code: devCode })} />
          </View>
        ) : null}

        <View className="mt-6 mb-8 flex-row items-center justify-center">
          {secondsLeft > 0 ? (
            <Text className="text-body text-ink-muted text-center">
              Resend OTP in <Text weight="semibold" className="text-brand-700">00:{secondsLeft.toString().padStart(2, '0')}</Text>
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={resendMutation.isPending}
              onPress={() => resendMutation.mutate()}
              className="h-touch justify-center"
            >
              <Text weight="semibold" className="text-body text-brand-700">
                Resend OTP
              </Text>
            </Pressable>
          )}
        </View>

        <Button
          label="Verify OTP"
          className="mb-6 bg-brand-800"
          loading={verifyMutation.isPending}
          onPress={() => submit(code)}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          className="h-touch justify-center items-center"
        >
          <Text weight="bold" className="text-body text-brand-700">
            Change mobile number
          </Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  heroImage: {
    width: '100%',
    height: 380,
    resizeMode: 'contain',
    marginTop: 10,
    zIndex: 1,
  },
  bottomCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 10,
    marginTop: -80, // Overlap over the image slightly
    flex: 1,
  }
});
