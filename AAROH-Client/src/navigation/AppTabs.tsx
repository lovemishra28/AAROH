import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components';
import { colors } from '@/theme/tokens';

import { HomeScreen } from '@/features/home/HomeScreen';
import { AnalysisScreen } from '@/features/analysis/AnalysisScreen';
import { RecommendationsScreen } from '@/features/history/RecommendationsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Focused/unfocused glyphs per tab — outline when idle, filled when active. */
const ICONS: Record<keyof AppTabParamList, [IoniconName, IoniconName]> = {
  Home: ['home-outline', 'home'],
  Analysis: ['analytics-outline', 'analytics'],
  Recommendations: ['sparkles-outline', 'sparkles'],
  Settings: ['person-outline', 'person'],
};

const LABEL_KEYS: Record<keyof AppTabParamList, string> = {
  Home: 'nav.home',
  Analysis: 'nav.analysis',
  Recommendations: 'nav.recommendation',
  Settings: 'nav.settings',
};

/**
 * The four home surfaces. Labels go through our <Text> so they pick the active-language
 * font (Devanagari for Hindi), and each screen renders its own in-screen header rather
 * than a native nav header, so headers stay off here.
 */
export function AppTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const name = route.name as keyof AppTabParamList;
        const [idle, active] = ICONS[name];
        return {
          headerShown: false,
          tabBarActiveTintColor: colors.brand[700],
          tabBarInactiveTintColor: colors.ink.muted,
          tabBarStyle: { borderTopColor: colors.line.default, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom, paddingTop: 6 },
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? active : idle} size={size ?? 22} color={color} />
          ),
          tabBarLabel: ({ color }) => (
            <Text weight="medium" className="text-xs" style={{ color, fontSize: 11 }}>
              {t(LABEL_KEYS[name])}
            </Text>
          ),
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Analysis" component={AnalysisScreen} />
      <Tab.Screen name="Recommendations" component={RecommendationsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
