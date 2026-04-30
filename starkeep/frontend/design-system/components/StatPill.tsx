import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii } from '../tokens';

interface StatPillProps {
  label: string;
  value: string | number;
  accent?: string;
}

export function StatPill({ label, value, accent = colors.fg.primary }: StatPillProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    minWidth: 80,
  },
  label: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.base,
    marginTop: 2,
  },
});
