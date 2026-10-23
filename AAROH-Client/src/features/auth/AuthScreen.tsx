import { useState } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';

import { loginWithEmail, registerWithEmail, requestOtp } from '@/api/auth';
import { ApiError, NetworkError } from '@/api/client';
import { Button, InfoStrip, Input, LanguageChip, Screen, Text } from '@/components';
import { useGoogleAuth, type GoogleAuthErrorReason } from '@/hooks/useGoogleAuth';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { isValidEmail, isValidName, isValidPassword } from '@/lib/validators';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/tokens';
import type { AuthScreenProps } from '@/navigation/types';

import { AuthTabs, type AuthMode } from './components/AuthTabs';
import { CountryCodeField } from './components/CountryCodeField';
import { GoogleButton } from './components/GoogleButton';
import { MethodTabs, type AuthMethod } from './components/MethodTabs';
import { PasswordField } from './components/PasswordField';

/**
 * The auth landing screen (redesign) — replaces the old bare phone-entry screen. One
 * screen carries Login/Sign Up (AuthTabs), a real Google Sign-In entry point, and a
 * Phone/Email method switch (MethodTabs). Phone always finishes on the OTP screen; Email
 * resolves directly to a session. See README "Authentication providers" for exactly what
 * server-side support each path needs.
 */

type TFn = (key: string, params?: Record<string, unknown>) => string;

const sheetShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 8,
};

function DividerRow({ label }: { label: string }) {
  return (
    <View className="flex-row items-center">
      <View className="h-px flex-1 bg-line" />
      <Text className="mx-3 text-sm text-ink-faint">{label}</Text>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

function googleErrorMessage(reason: GoogleAuthErrorReason, t: TFn): string {
  switch (reason) {
    case 'not_configured':
      return t('auth.googleNotConfigured');
    case 'server_not_configured':
      return t('auth.googleServerNotConfigured');
    case 'developer_error':
      return t('auth.googleDeveloperError');
    case 'in_progress':
      return t('auth.googleInProgress');
    case 'play_services':
      return t('auth.googlePlayServices');
    case 'network':
      return t('health.failed');
    default:
      if (reason?.startsWith('unknown_')) {
        return `${t('auth.googleError')} (Code: ${reason.split('_')[1]})`;
      }
      return t('auth.googleError');
  }
}

function describeEmailAuthError(err: unknown, t: TFn): string {
  if (err instanceof NetworkError) return t('health.failed');
  if (err instanceof ApiError) {
    // 404 means the server predates the email auth routes — kept as a safety net so
    // an old build reports "not available yet" instead of a generic failure.
    if (err.status === 404) return t('auth.errEmailUnavailable');
    if (err.status === 401 || err.code === 'INVALID_CREDENTIALS') {
      return t('auth.errInvalidCredentials');
    }
    if (err.status === 409 || err.code === 'EMAIL_TAKEN' || err.code === 'EMAIL_IN_USE') {
      return t('auth.errEmailInUse');
    }
    if (err.status === 429) return t('auth.errTooMany');
  }
  return t('auth.errEmailAuthGeneric');
}

export function AuthScreen({ navigation }: AuthScreenProps<'Auth'>) {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);
  const google = useGoogleAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<AuthMethod>('phone');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const otpMutation = useMutation({
    mutationFn: (normalized: string) => requestOtp(normalized),
    onSuccess: (result, normalized) => {
      navigation.navigate('Otp', {
        phone: normalized,
        devCode: result.dev_code,
        mode,
        name: mode === 'signup' ? name.trim() : undefined,
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) setFormError(t('auth.errTooMany'));
      else if (err instanceof NetworkError) setFormError(t('health.failed'));
      else setFormError(t('auth.errOtpRequest'));
    },
  });

  const emailLoginMutation = useMutation({
    mutationFn: loginWithEmail,
    onSuccess: async (result) => {
      await setSession(result, result.farmer);
    },
    onError: (err) => setFormError(describeEmailAuthError(err, t)),
  });

  const emailSignupMutation = useMutation({
    mutationFn: registerWithEmail,
    onSuccess: async (result) => {
      await setSession(result, result.farmer);
    },
    onError: (err) => setFormError(describeEmailAuthError(err, t)),
  });

  const isPending =
    otpMutation.isPending || emailLoginMutation.isPending || emailSignupMutation.isPending;

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setFormError(null);
    setNameError(null);
    setPhoneError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
  };

  const changeMethod = (next: AuthMethod) => {
    setMethod(next);
    setFormError(null);
    setPhoneError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
  };

  const onSubmit = () => {
    setFormError(null);
    let ok = true;

    if (mode === 'signup') {
      if (!isValidName(name)) {
        setNameError(t('auth.errNameRequired'));
        ok = false;
      } else {
        setNameError(null);
      }
    } else {
      setNameError(null);
    }

    if (method === 'phone') {
      if (!isValidPhone(phone)) {
        setPhoneError(t('auth.errInvalidPhone'));
        ok = false;
      } else {
        setPhoneError(null);
      }
    } else {
      if (!isValidEmail(email)) {
        setEmailError(t('auth.errInvalidEmail'));
        ok = false;
      } else {
        setEmailError(null);
      }
      if (!isValidPassword(password)) {
        setPasswordError(t('auth.errInvalidPassword'));
        ok = false;
      } else {
        setPasswordError(null);
      }
      if (mode === 'signup' && password !== confirmPassword) {
        setConfirmError(t('auth.errPasswordMismatch'));
        ok = false;
      } else {
        setConfirmError(null);
      }
    }

    if (!ok) return;

    if (method === 'phone') {
      otpMutation.mutate(normalizePhone(phone) as string);
    } else if (mode === 'login') {
      emailLoginMutation.mutate({ email: email.trim().toLowerCase(), password });
    } else {
      emailSignupMutation.mutate({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
    }
  };

  const submitLabel =
    method === 'phone'
      ? t('auth.sendCode')
      : mode === 'login'
        ? t('auth.loginAction')
        : t('auth.createAccountAction');

  return (
    <Screen className="bg-brand-50">
      <KeyboardAwareScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid={true}
        extraScrollHeight={20}
      >
          <View style={{ position: 'relative' }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: 10 }}>
              <Ionicons
                name="leaf"
                size={30}
                color={colors.grow[100]}
                style={{ transform: [{ rotate: '-25deg' }] }}
              />
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', top: 30, left: 42 }}>
              <Ionicons
                name="leaf"
                size={16}
                color={colors.grow[100]}
                style={{ transform: [{ rotate: '15deg' }] }}
              />
            </View>

            <LanguageChip className="absolute right-5 top-2" />

            <View className="items-center px-6 pt-6">
              <Image
                source={require('../../../assets/images/logo.png')}
                className="h-14 w-52"
                resizeMode="contain"
              />

              <Text weight="bold" className="mt-5 text-center text-title text-ink">
                {t('auth.welcomeTitle')} 🌿
              </Text>
              <Text className="mt-1 text-center text-body text-ink-muted">
                {t('auth.welcomeSubtitle')}
              </Text>

              <View style={{ position: 'relative' }}>
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    left: -30,
                    right: -30,
                    height: 120,
                    borderRadius: 200,
                    backgroundColor: colors.grow[50],
                    opacity: 0.7,
                  }}
                />
                <Image
                  source={require('../../../assets/images/farmer-hero.png')}
                  className="mt-3 h-52 w-52"
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>

          <View
            className="-mt-3 flex-1 rounded-t-3xl border border-line bg-surface px-5 pb-6 pt-6"
            style={sheetShadow}
          >
            <AuthTabs
              mode={mode}
              onChange={changeMode}
              loginLabel={t('auth.tabLogin')}
              signUpLabel={t('auth.tabSignUp')}
            />

            <View className="mt-5">
              <GoogleButton
                label={t('auth.continueWithGoogle')}
                onPress={() => void google.signIn()}
                loading={google.loading}
              />
            </View>
            {google.errorReason ? (
              <View className="mt-2">
                <InfoStrip tone="avoid" text={googleErrorMessage(google.errorReason, t)} />
              </View>
            ) : null}

            <View className="mt-5">
              <DividerRow label={t('auth.or')} />
            </View>

            <View className="mt-5">
              <MethodTabs
                method={method}
                onChange={changeMethod}
                phoneLabel={t('auth.methodPhone')}
                emailLabel={t('auth.methodEmail')}
              />
            </View>

            <View className="mt-5" style={{ gap: 16 }}>
              {mode === 'signup' ? (
                <Input
                  label={t('auth.nameLabel')}
                  icon="person-outline"
                  placeholder={t('auth.namePlaceholder')}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (nameError) setNameError(null);
                  }}
                  error={nameError}
                  returnKeyType="next"
                />
              ) : null}

              {method === 'phone' ? (
                <View>
                  <Text weight="medium" className="mb-1.5 text-body text-ink">
                    {t('auth.phoneLabel')}
                  </Text>
                  <View className="flex-row" style={{ gap: 10 }}>
                    <CountryCodeField />
                    <View className="flex-1">
                      <Input
                        icon="call-outline"
                        keyboardType="phone-pad"
                        autoComplete="tel"
                        maxLength={15}
                        placeholder={t('auth.phonePlaceholder')}
                        value={phone}
                        onChangeText={(v) => {
                          setPhone(v);
                          if (phoneError) setPhoneError(null);
                        }}
                        returnKeyType="done"
                        onSubmitEditing={onSubmit}
                      />
                    </View>
                  </View>
                  {phoneError ? (
                    <Text className="mt-1 text-sm text-avoid-600">{phoneError}</Text>
                  ) : null}
                </View>
              ) : (
                <>
                  <Input
                    label={t('auth.emailLabel')}
                    icon="mail-outline"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      if (emailError) setEmailError(null);
                    }}
                    error={emailError}
                    returnKeyType="next"
                  />
                  <PasswordField
                    label={t('auth.passwordLabel')}
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      if (passwordError) setPasswordError(null);
                    }}
                    error={passwordError}
                    showStrength={mode === 'signup'}
                    returnKeyType={mode === 'signup' ? 'next' : 'done'}
                    onSubmitEditing={mode === 'signup' ? undefined : onSubmit}
                  />
                  {mode === 'signup' ? (
                    <PasswordField
                      label={t('auth.confirmPasswordLabel')}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      value={confirmPassword}
                      onChangeText={(v) => {
                        setConfirmPassword(v);
                        if (confirmError) setConfirmError(null);
                      }}
                      error={confirmError}
                      returnKeyType="done"
                      onSubmitEditing={onSubmit}
                    />
                  ) : null}
                </>
              )}
            </View>

            {method === 'phone' ? (
              <View
                className="mt-4 flex-row items-center justify-center"
                style={{ gap: 6 }}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={colors.grow[600]}
                />
                <Text className="text-sm text-grow-700">{t('auth.otpHelper')}</Text>
              </View>
            ) : null}

            {formError ? (
              <Text className="mt-4 text-center text-body text-avoid-600">{formError}</Text>
            ) : null}

            <Button
              label={submitLabel}
              icon="arrow-forward"
              className="mt-5"
              loading={isPending}
              onPress={onSubmit}
            />

            <View className="mt-5 flex-row flex-wrap items-center justify-center">
              <Text className="text-sm text-ink-muted">
                {mode === 'login' ? t('auth.noAccountPrompt') : t('auth.haveAccountPrompt')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => changeMode(mode === 'login' ? 'signup' : 'login')}
              >
                <Text weight="semibold" className="text-sm text-brand-700">
                  {mode === 'login' ? t('auth.tabSignUp') : t('auth.tabLogin')}
                </Text>
              </Pressable>
            </View>
          </View>

          <View
            className="flex-row items-center justify-center bg-brand-50 px-6 py-6"
            style={{ gap: 8 }}
          >
            <Ionicons name="shield-checkmark" size={16} color={colors.brand[500]} />
            <Text className="text-sm text-ink-muted">{t('auth.secureNote')}</Text>
          </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
