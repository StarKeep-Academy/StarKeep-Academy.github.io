/**
 * features/starmap/components/NorthStarScreen.tsx
 *
 * Zoom 0 — North Star Screen.
 * Shows: purpose statement, momentum signals (last star, most active constellation),
 * next-step card, and the North Star ★ icon that opens the Full Sky (Zoom 1).
 *
 * STARMAP_SPEC §2 — read only. Phase 4 adds goal editing.
 */

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';
import type { StarMap, Constellation } from '../index';
import type { AvatarProfile } from '../../avatar/index';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  starMap:             StarMap;
  avatar:              AvatarProfile | undefined;
  onOpenSky:           () => void;   // navigate to Zoom 1
  onOpenConstellation: (id: string) => void;
}

// ─── Compute helpers ──────────────────────────────────────────────────────────

function getLastStarDate(starMap: StarMap): Date | null {
  const all = starMap.constellation_paths
    .flatMap(p => p.constellations)
    .flatMap(c => c.stars);
  if (!all.length) return null;
  return new Date(
    Math.max(...all.map(s => new Date(s.completed_at).getTime()))
  );
}

function getMostActiveConstellation(starMap: StarMap): Constellation | null {
  const all = starMap.constellation_paths.flatMap(p => p.constellations);
  if (!all.length) return null;

  return all.reduce<Constellation | null>((best, c) => {
    const cMax = c.stars.reduce(
      (m, s) => Math.max(m, new Date(s.completed_at).getTime()), 0
    );
    if (!best) return c;
    const bMax = best.stars.reduce(
      (m, s) => Math.max(m, new Date(s.completed_at).getTime()), 0
    );
    return cMax > bMax ? c : best;
  }, null);
}

function getNextStep(starMap: StarMap): {
  milestoneId: string;
  title: string;
  constellationId: string | null;
  constellationName: string | null;
} | null {
  // Priority per spec: active first, then pending
  const next =
    starMap.pending_milestones.find(m => m.status === 'active') ??
    starMap.pending_milestones.find(m => m.status === 'pending');
  if (!next) return null;

  let constellationName: string | null = null;
  if (next.constellation_id) {
    const found = starMap.constellation_paths
      .flatMap(p => p.constellations)
      .find(c => c.id === next.constellation_id);
    constellationName = found?.name ?? null;
  }

  return {
    milestoneId:      next.id,
    title:            next.title,
    constellationId:  next.constellation_id,
    constellationName,
  };
}

function formatRelative(date: Date): string {
  const diffMs   = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30)  return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12)    return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NorthStarScreen({ starMap, avatar, onOpenSky, onOpenConstellation }: Props) {
  const purposeText = avatar?.north_star_goal || avatar?.purpose || '';
  const lastStarDate    = useMemo(() => getLastStarDate(starMap), [starMap]);
  const mostActive      = useMemo(() => getMostActiveConstellation(starMap), [starMap]);
  const nextStep        = useMemo(() => getNextStep(starMap), [starMap]);

  const handleNextStepPress = () => {
    if (nextStep?.constellationId) {
      onOpenConstellation(nextStep.constellationId);
    } else {
      onOpenSky();
    }
  };

  return (
    <View style={styles.container}>

      {/* Purpose statement — dominant, emotional */}
      {purposeText ? (
        <Text style={styles.purpose}>{purposeText}</Text>
      ) : (
        <Text style={styles.purposeEmpty}>
          Your North Star goal is not set yet.{'\n'}Complete your avatar setup to begin.
        </Text>
      )}

      <View style={styles.divider} />

      {/* Momentum signals */}
      <View style={styles.momentum}>
        {lastStarDate ? (
          <Text style={styles.momentumLine}>
            Last star:{' '}
            <Text style={styles.momentumValue}>{formatRelative(lastStarDate)}</Text>
          </Text>
        ) : (
          <Text style={styles.momentumLine}>No stars earned yet</Text>
        )}

        {mostActive && mostActive.stars.length > 0 && (
          <Text style={styles.momentumLine}>
            Most active:{' '}
            <Text style={[styles.momentumValue, { color: colors.accent.cyan }]}>
              {mostActive.name}
            </Text>
          </Text>
        )}
      </View>

      {/* Next step card */}
      {nextStep && (
        <Pressable
          style={({ pressed }) => [styles.nextStep, pressed && { opacity: 0.75 }]}
          onPress={handleNextStepPress}
        >
          <Text style={styles.nextStepLabel}>YOUR NEXT STEP</Text>
          <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
          {nextStep.constellationName && (
            <Text style={styles.nextStepConstellation}>
              → {nextStep.constellationName}
            </Text>
          )}
        </Pressable>
      )}

      {/* North Star icon — collapses minimap / opens Full Sky */}
      <Pressable style={styles.northStarBtn} onPress={onOpenSky}>
        <Text style={styles.northStarGlyph}>★</Text>
      </Pressable>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:    1,
    padding: spacing.lg,
  },

  purpose: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xl,
    color:         colors.fg.primary,
    letterSpacing: typography.tracking.wide,
    lineHeight:    typography.sizes.xl * typography.lineHeights.normal,
    textAlign:     'center',
    paddingHorizontal: spacing.md,
    marginTop:     spacing.xl,
  },
  purposeEmpty: {
    fontFamily:    typography.fonts.body,
    fontSize:      typography.sizes.md,
    color:         colors.fg.subtle,
    textAlign:     'center',
    lineHeight:    typography.sizes.md * typography.lineHeights.relaxed,
    marginTop:     spacing.xl,
    paddingHorizontal: spacing.lg,
  },

  divider: {
    height:           1,
    backgroundColor:  colors.border.default,
    marginVertical:   spacing.xl,
    marginHorizontal: spacing.md,
  },

  momentum: {
    gap:              spacing.xs,
    paddingHorizontal: spacing.md,
  },
  momentumLine: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.sm,
    color:      colors.fg.muted,
  },
  momentumValue: {
    color: colors.fg.primary,
  },

  nextStep: {
    marginTop:        spacing.xl,
    backgroundColor:  colors.bg.surface,
    borderRadius:     radii.lg,
    padding:          spacing.md,
    gap:              spacing.xs,
    borderWidth:      1,
    borderColor:      colors.border.default,
  },
  nextStepLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
  },
  nextStepTitle: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.base,
    color:      colors.fg.primary,
  },
  nextStepConstellation: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.xs,
    color:      colors.accent.cyan,
  },

  northStarBtn: {
    position:    'absolute',
    bottom:      spacing.xl,
    right:       spacing.lg,
    width:       40,
    height:      40,
    alignItems:  'center',
    justifyContent: 'center',
  },
  northStarGlyph: {
    fontSize:        24,
    color:           colors.accent.gold,
    textShadowColor: colors.accent.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
