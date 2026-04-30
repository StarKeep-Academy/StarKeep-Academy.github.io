import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, radii } from '../tokens';
import type { ArchetypeProfile } from '../../features/avatar/index';

// Unicode stand-ins for astrological glyphs (v1 placeholder — real SVGs in v2)
const ASTRO_SYMBOLS: Record<string, string> = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋',
  leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏',
  sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
};

const JUNG_SYMBOLS: Record<string, string> = {
  hero: '⚔', magician: '✦', sage: '◎', ruler: '♛',
  creator: '✧', explorer: '⊕', outlaw: '⚡', innocent: '◯',
  lover: '♡', caregiver: '♥', jester: '★', everyman: '◈',
};

interface GlyphCellProps {
  symbol: string;
  label:  string;
  value:  string;
}

function GlyphCell({ symbol, label, value }: GlyphCellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.symbol}>{symbol}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value.toUpperCase()}</Text>
    </View>
  );
}

interface ArchetypeGlyphGridProps {
  archetype: ArchetypeProfile | null;
}

export function ArchetypeGlyphGrid({ archetype }: ArchetypeGlyphGridProps) {
  const router = useRouter();

  if (!archetype) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>ARCHETYPES</Text>
        <Text style={styles.emptyBody}>
          Complete the archetype quiz to unlock your cosmic profile.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.quizButton, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/(shell)/avatar/quiz')}
          accessibilityRole="button"
          accessibilityLabel="Take the archetype quiz"
        >
          <Text style={styles.quizButtonText}>TAKE THE QUIZ</Text>
        </Pressable>
      </View>
    );
  }

  const sunSymbol  = ASTRO_SYMBOLS[archetype.sun_sign?.toLowerCase()]    ?? '◉';
  const moonSymbol = ASTRO_SYMBOLS[archetype.moon_sign?.toLowerCase()]   ?? '◑';
  const riseSymbol = ASTRO_SYMBOLS[archetype.rising_sign?.toLowerCase()] ?? '◌';
  const jungSymbol = JUNG_SYMBOLS[archetype.jung_archetype?.toLowerCase()] ?? '✦';

  return (
    <View style={styles.grid}>
      <GlyphCell symbol={sunSymbol}  label="Sun"    value={archetype.sun_sign    || '—'} />
      <GlyphCell symbol={moonSymbol} label="Moon"   value={archetype.moon_sign   || '—'} />
      <GlyphCell symbol={riseSymbol} label="Rising" value={archetype.rising_sign || '—'} />
      <GlyphCell symbol={jungSymbol} label="Jung"   value={archetype.jung_archetype || '—'} />
      <GlyphCell symbol="◈"          label="MBTI"   value={archetype.mbti        || '—'} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    minWidth: 72,
    gap: 2,
  },
  symbol: {
    fontSize: 22,
  },
  cellLabel: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    textTransform: 'uppercase',
  },
  cellValue: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.accent.cyan,
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    color: colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
  },
  emptyBody: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
    textAlign: 'center',
  },
  quizButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.accent.blue,
    borderRadius: radii.full,
  },
  quizButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
});
