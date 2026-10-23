import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthScreen } from '@/features/auth/AuthScreen';
import { OtpScreen } from '@/features/auth/OtpScreen';

import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Shown while unauthenticated: the Login/Sign Up landing screen → OTP verification.
 *
 * Profile completion (name capture) is intentionally NOT a screen here — it is gated at
 * the root by RootNavigator once the farmer is authenticated but still has no name, so it
 * works identically for the phone, email, and Google sign-in paths.
 */
export function AuthNavigator() {
  return (
    <Stack.Navigator initialRouteName="Auth" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
    </Stack.Navigator>
  );
}
