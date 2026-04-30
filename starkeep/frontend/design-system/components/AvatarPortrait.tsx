/**
 * AvatarPortrait — Image 7 left panel.
 * Reused in Academy chat sidebar (Image 2) — keep it self-contained.
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, shadows, pathColors, layout } from '../tokens';
import type { AvatarProfile } from '../../features/avatar/index';

interface AvatarPortraitProps {
  avatar: AvatarProfile;
}

export function AvatarPortrait({ avatar }: AvatarPortraitProps) {
  const pathSlug  = avatar.heroic_path?.slug ?? '';
  const pathColor = pathColors[pathSlug] ?? colors.accent.cyan;

  return (
    <View style={[styles.card, shadows.card]}>
      {/* Path glyph ring — first letter of path slug (v1 placeholder; real SVG in v2) */}
      <View style={[styles.glyphRing, { borderColor: pathColor }]}>
        <Text style={[styles.glyphLetter, { color: pathColor }]}>
          {pathSlug ? pathSlug.charAt(0).toUpperCase() : '?'}
        </Text>
      </View>

      {/* Alias */}
      <Text style={styles.alias} numberOfLines={2} adjustsFontSizeToFit>
        {avatar.alias || 'UNNAMED'}
      </Text>

      {/* Avatar figure placeholder */}
      <View style={[styles.figurePlaceholder, { borderColor: pathColor }]}>
        <Text style={[styles.figureInitials, { color: pathColor }]}>
          {avatar.alias ? avatar.alias.substring(0, 2).toUpperCase() : '??'}
        </Text>
      </View>

      {/* Display name and level */}
      <Text style={styles.displayName}>{avatar.display_name || '—'}</Text>
      <Text style={[styles.level, { color: colors.accent.gold }]}>LVL {avatar.level}</Text>

      {/* Powers (up to 4) */}
      {avatar.powers && avatar.powers.length > 0 && (
        <View style={styles.powersList}>
          {avatar.powers.slice(0, 4).map((power, i) => (
            <View key={i} style={styles.powerRow}>
              <Text style={[styles.powerDot, { color: pathColor }]}>◆</Text>
              <Text style={styles.powerText}>{power}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    minWidth: layout.avatarCardWidth,
  },
  glyphRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLetter: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xl,
  },
  alias: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xl,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    textAlign: 'center',
  },
  figurePlaceholder: {
    width: 120,
    height: 140,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figureInitials: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xxl,
  },
  displayName: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.muted,
    letterSpacing: 1,
  },
  level: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.md,
  },
  powersList: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  powerDot: {
    fontSize: 8,
  },
  powerText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
    flex: 1,
  },
});
