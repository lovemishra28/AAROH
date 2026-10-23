import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

import { useAuthStore } from '@/store/authStore';
import { BrandHeader } from '@/components';
import { colors } from '@/theme/tokens';

import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { ProfileCompleteScreen } from '@/features/auth/ProfileCompleteScreen';

/**
 * Root switch. Auth status *and* profile completeness decide which tree mounts:
 *   loading                       → branded splash while tokens hydrate
 *   unauthenticated               → AuthNavigator (phone → OTP)
 *   authenticated, no name yet    → ProfileComplete (one-time name capture)
 *   authenticated, name present   → AppNavigator
 *
 * Gating on farmer.name *here* — rather than pushing a screen from OtpScreen — is what
 * makes the prompt reliable. The instant setSession flips status to 'authenticated', the
 * AuthNavigator unmounts, so any imperative navigation.replace() from inside it never
 * lands. Because the gate is store-driven, a new user from ANY door (phone, email, or
 * Google) who has no name set passes through the exact same name-capture step.
 */
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const farmer = useAuthStore((s) => s.farmer);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <BrandHeader />
        <View className="mt-6">
          <ActivityIndicator color={colors.brand[600]} />
        </View>
      </View>
    );
  }

  if (status === 'authenticated') {
    // An authenticated farmer with no name must complete their profile before the app
    // opens. setFarmer (after updateMe) re-runs this gate and swaps in the app.
    if (!farmer?.name || !farmer.name.trim()) {
      return <ProfileCompleteScreen />;
    }
    return (
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <AuthNavigator />
    </NavigationContainer>
  );
}
