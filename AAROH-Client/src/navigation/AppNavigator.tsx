import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppTabs } from './AppTabs';
import { FieldCreateScreen } from '@/features/fields/FieldCreateScreen';
import { FieldDetailScreen } from '@/features/fields/FieldDetailScreen';
import { ManualReadingScreen } from '@/features/readings/ManualReadingScreen';
import { RecommendationScreen } from '@/features/recommendations/RecommendationScreen';

import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Shown once authenticated. A native stack whose root is the bottom-tab navigator; the
 * field/reading/recommendation screens are pushed on top so they get a back button and a
 * slide transition and never appear as tabs. Headers are off — every screen draws its own
 * in-screen header (back chevron + title) for full control of the Hindi typography.
 */
export function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} />
      <Stack.Screen name="FieldCreate" component={FieldCreateScreen} />
      <Stack.Screen name="FieldDetail" component={FieldDetailScreen} />
      <Stack.Screen name="ManualReading" component={ManualReadingScreen} />
      <Stack.Screen name="Recommendation" component={RecommendationScreen} />
    </Stack.Navigator>
  );
}
