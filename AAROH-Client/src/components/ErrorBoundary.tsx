import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme/tokens';

import { Button } from './Button';
import { Text } from './Text';

/**
 * Last-resort error boundary (M7). A render-time crash anywhere in the tree lands here as a
 * calm, branded recovery card instead of a red box — the farmer taps "try again" and we
 * remount the subtree. Strings are intentionally not translated: i18n itself could be the
 * thing that failed, so we keep this dependency-free and bilingual in one line.
 */
type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[AgroPulse] Uncaught render error:', error);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center bg-surface px-8">
        <View className="h-16 w-16 items-center justify-center rounded-pill bg-avoid-50">
          <Ionicons name="alert-circle-outline" size={30} color={colors.avoid[600]} />
        </View>
        <Text weight="semibold" className="mt-4 text-center text-body-lg text-ink">
          कुछ गड़बड़ हो गई · Something went wrong
        </Text>
        <Text className="mt-1 text-center text-body text-ink-muted">
          फिर कोशिश करें · Please try again
        </Text>
        <Button
          label="फिर कोशिश करें · Retry"
          variant="secondary"
          icon="refresh-outline"
          className="mt-5"
          onPress={this.reset}
        />
      </View>
    );
  }
}
