/**
 * app/(shell)/avatar/index.tsx
 *
 * Image 7 three-panel layout:
 * ┌───────────────┬────────────────────┬───────────────────────┐
 * │  LEFT PANEL   │   CENTER PANEL     │   RIGHT PANEL         │
 * │  AvatarPortrait  Level, Paths,     │   Hours of Impact,    │
 * │  Alias        │   Archetypes,      │   Traits, Astro,      │
 * │  Level        │   Purpose          │   Jung, MBTI          │
 * └───────────────┴────────────────────┴───────────────────────┘
 *
 * Mobile: panels stack vertically (left → center → right)
 * Tablet/web (≥768px): three-column layout
 */

import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../../features/auth/store';
import { useAvatar, type AvatarProfile } from '../../../features/avatar/index';
import { colors, typography, spacing, radii, layout } from '../../../design-system/tokens';
import { AvatarPortrait } from '../../../design-system/components/AvatarPortrait';
import { StatPill } from '../../../design-system/components/StatPill';
import { PathBadge } from '../../../design-system/components/PathBadge';
import { ArchetypeGlyphGrid } from '../../../design-system/components/ArchetypeGlyphGrid';
import { AttributeBlock } from '../../../design-system/components/AttributeBlock';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AvatarScreen() {
  const avatarId = useAuthStore(s => s.avatarId);
  const { data: avatar, isLoading, error } = useAvatar(avatarId ?? '');
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Pressable onPress={() => router.back()} style={styles.homeBtn}>
          <Text style={styles.homeText}>‹ MENU</Text>
        </Pressable>
        <ActivityIndicator color={colors.accent.cyan} size="large" />
      </View>
    );
  }

  if (error || !avatar) {
    return (
      <View style={styles.centered}>
        <Pressable onPress={() => router.back()} style={styles.homeBtn}>
          <Text style={styles.homeText}>‹ MENU</Text>
        </Pressable>
        <Text style={styles.errorText}>Unable to load Avatar. Pull to retry.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => router.back()} style={styles.homeBtn}>
        <Text style={styles.homeText}>‹ MENU</Text>
      </Pressable>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      >
        <LeftPanel   avatar={avatar} />
        <CenterPanel avatar={avatar} />
        <RightPanel  avatar={avatar} />
      </ScrollView>
    </View>
  );
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function LeftPanel({ avatar }: { avatar: AvatarProfile }) {
  return (
    <View style={styles.leftPanel}>
      <AvatarPortrait avatar={avatar} />
    </View>
  );
}

// ─── Center Panel ─────────────────────────────────────────────────────────────

function CenterPanel({ avatar }: { avatar: AvatarProfile }) {
  return (
    <View style={styles.centerPanel}>
      <SectionLabel>HOW FAR YOU'VE COME</SectionLabel>
      <View style={styles.pillRow}>
        <StatPill label="Level" value={`LVL ${avatar.level}`} accent={colors.accent.gold} />
      </View>

      <SectionLabel>HOW YOU CREATE IMPACT</SectionLabel>
      <PathBadge path={avatar.heroic_path} variant="heroic" />

      <SectionLabel>HOW YOU LEARN & GROW</SectionLabel>
      <PathBadge path={avatar.learning_path} variant="learning" />

      <SectionLabel>ARCHETYPES</SectionLabel>
      <ArchetypeGlyphGrid archetype={avatar.archetype} />

      {avatar.purpose ? (
        <>
          <SectionLabel>YOUR CALLING</SectionLabel>
          <Text style={styles.purposeText}>{avatar.purpose}</Text>
        </>
      ) : null}
    </View>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function RightPanel({ avatar }: { avatar: AvatarProfile }) {
  const arch = avatar.archetype;

  return (
    <View style={styles.rightPanel}>
      <AttributeBlock label="HOURS OF IMPACT" value={avatar.hours_of_impact.toLocaleString()}>
        {avatar.impact_sources.slice(0, 5).map((src, i) => (
          <Text key={i} style={styles.impactSource}>
            · {src.label} ({src.hours} hrs)
          </Text>
        ))}
      </AttributeBlock>

      {arch ? (
        <>
          <AttributeBlock
            label="VISIONARY TRAIT"
            value={arch.visionary_trait || '—'}
          />
          <AttributeBlock
            label="DIVERGENT TRAIT"
            value={arch.divergent_trait || '—'}
          />
          <AttributeBlock label="ASTRO">
            <Text style={styles.astroRow}>
              <Text style={styles.astroKey}>SUN    </Text>
              {arch.sun_sign?.toUpperCase() || '—'}
            </Text>
            <Text style={styles.astroRow}>
              <Text style={styles.astroKey}>MOON   </Text>
              {arch.moon_sign?.toUpperCase() || '—'}
            </Text>
            <Text style={styles.astroRow}>
              <Text style={styles.astroKey}>RISING </Text>
              {arch.rising_sign?.toUpperCase() || '—'}
            </Text>
          </AttributeBlock>
          <AttributeBlock
            label="JUNG ARCHETYPE"
            value={arch.jung_archetype?.toUpperCase() || '—'}
          />
          <AttributeBlock
            label="MBTI TYPE"
            value={arch.mbti?.toUpperCase() || '—'}
          />
          {arch.purpose_seed ? (
            <AttributeBlock label="PURPOSE STATEMENT" value={arch.purpose_seed} />
          ) : null}
        </>
      ) : (
        <View style={styles.archPlaceholder}>
          <Text style={styles.archPlaceholderText}>
            Complete the archetype quiz to unlock your Visionary, Divergent, and Astro insights.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  homeBtn: {
    position:  'absolute',
    top:       spacing.lg,
    left:      spacing.lg,
    zIndex:    10,
    padding:   spacing.sm,
  },
  homeText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  content: {
    padding:       spacing.lg,
    paddingTop:    spacing.lg + 36,  // clear the HOME button
    gap:           spacing.lg,
  },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.base,
  },
  errorText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.semantic.danger,
  },

  // Panels
  leftPanel: {
    alignItems: 'center',
  },
  centerPanel: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rightPanel: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },

  // Center panel elements
  sectionLabel: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  purposeText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.accent.cyan,
    lineHeight: typography.sizes.base * 1.6,
    fontStyle: 'italic',
  },

  // Right panel elements
  impactSource: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
    marginTop: 2,
  },
  astroRow: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.sm,
    color: colors.fg.primary,
    marginTop: 2,
  },
  astroKey: {
    color: colors.fg.subtle,
  },
  archPlaceholder: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
    marginTop: spacing.md,
  },
  archPlaceholderText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
    lineHeight: typography.sizes.sm * 1.6,
  },
});
