import { View, Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { colors, typography, spacing } from '../tokens';

interface AttributeBlockProps {
  label: string;
  value?: string | number;
  children?: ReactNode;
}

export function AttributeBlock({ label, value, children }: AttributeBlockProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {value !== undefined && <Text style={styles.value}>{value}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  label: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  value: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.primary,
    lineHeight: typography.sizes.base * 1.6,
  },
});
