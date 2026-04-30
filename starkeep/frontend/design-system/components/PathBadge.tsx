import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, pathColors } from '../tokens';
import type { HeroicPath, LearningPath } from '../../features/avatar/index';

interface PathBadgeProps {
  path: HeroicPath | LearningPath | null;
  variant: 'heroic' | 'learning';
}

export function PathBadge({ path, variant }: PathBadgeProps) {
  if (!path) {
    return (
      <View style={styles.emptyBadge}>
        <Text style={styles.emptyText}>Not selected</Text>
      </View>
    );
  }

  const color  = variant === 'heroic' ? (pathColors[path.slug] ?? colors.accent.cyan) : colors.accent.blue;
  const campus = variant === 'heroic' ? (path as HeroicPath).campus : undefined;

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.name, { color }]}>{path.display_name.toUpperCase()}</Text>
      {campus ? <Text style={styles.campus}>{campus}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    gap: 2,
  },
  name: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    letterSpacing: typography.tracking.wide,
  },
  campus: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
  },
  emptyBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
  },
  emptyText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.subtle,
  },
});
