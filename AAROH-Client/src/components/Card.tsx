import { type ReactNode } from 'react';
import { View } from 'react-native';

type CardProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The universal container from the reference: white, 16 radius, hairline border, roomy
 * padding. Metric tiles, form sheets, settings rows and step lists all sit in one.
 */
export function Card({ children, className }: CardProps) {
  return (
    <View className={`rounded-card border border-line bg-surface p-4 ${className ?? ''}`}>
      {children}
    </View>
  );
}
