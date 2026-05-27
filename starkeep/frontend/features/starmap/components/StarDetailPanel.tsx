/**
 * features/starmap/components/StarDetailPanel.tsx
 *
 * Zoom 3 — Star Detail (read-only for Phase 3).
 * Mobile: slides up from the bottom as a sheet.
 * Web:    slides in from the right as a side panel.
 *
 * STARMAP_SPEC §5 — completed star state only in Phase 3.
 * Phase 4 adds: evidence display, submit flow, planet checklist.
 */

import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';
import type { Star } from '../index';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  star:    Star;
  onClose: () => void;
}

// ─── Shared panel content ─────────────────────────────────────────────────────

function PanelContent({ star, onClose }: Props) {
  const date = new Date(star.completed_at).toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
  });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      {/* Close row */}
      <View style={styles.closeRow}>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      {/* Star glyph + title */}
      <View style={styles.titleRow}>
        <Text style={styles.starGlyph}>★</Text>
        <Text style={styles.title}>{star.title}</Text>
      </View>

      {/* Description */}
      {star.description ? (
        <Text style={styles.description}>{star.description}</Text>
      ) : null}

      <View style={styles.divider} />

      {/* Completion info */}
      <View style={styles.completionSection}>
        <Text style={styles.completedLabel}>COMPLETED</Text>
        <Text style={styles.completedDate}>{date}</Text>
      </View>

      {/* LUX earned */}
      {star.lux_issued > 0 && (
        <View style={styles.luxRow}>
          <Text style={styles.luxLabel}>LUX EARNED</Text>
          <Text style={styles.luxValue}>+{star.lux_issued}</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* Evidence section — read-only placeholder */}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceLabel}>EVIDENCE SUBMITTED</Text>
        <Text style={styles.evidencePlaceholder}>
          Evidence details available in Phase 4.
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Mobile: bottom sheet ─────────────────────────────────────────────────────

function MobileSheet({ star, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:  0,
      friction: 9,
      tension:  60,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.mobileOverlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.mobilePanel, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <PanelContent star={star} onClose={onClose} />
      </Animated.View>
    </View>
  );
}

// ─── Web: right side panel ───────────────────────────────────────────────────

function WebSidePanel({ star, onClose }: Props) {
  const { height: H } = useWindowDimensions();
  const arcH          = H / 3;  // dome height approximation
  const slideAnim     = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:  0,
      friction: 9,
      tension:  60,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Pressable
        style={[StyleSheet.absoluteFillObject, styles.backdrop]}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.webPanel,
          {
            top:       arcH,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <PanelContent star={star} onClose={onClose} />
      </Animated.View>
    </View>
  );
}

// ─── Main export — platform-switched ─────────────────────────────────────────

export function StarDetailPanel(props: Props) {
  return Platform.OS === 'web'
    ? <WebSidePanel {...props} />
    : <MobileSheet  {...props} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shared
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  scroll:        { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.xl,
  },

  // Mobile sheet
  mobileOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  mobilePanel: {
    backgroundColor:      colors.bg.surface,
    borderTopLeftRadius:  radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight:            '72%',
    borderTopWidth:       1,
    borderColor:          colors.border.default,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: colors.border.strong,
    alignSelf:       'center',
    marginTop:       spacing.sm,
    marginBottom:    spacing.xs,
  },

  // Web side panel
  webPanel: {
    position:        'absolute',
    right:           0,
    bottom:          0,
    width:           360,
    backgroundColor: colors.bg.surface,
    borderLeftWidth: 1,
    borderTopWidth:  1,
    borderColor:     colors.border.default,
    borderTopLeftRadius: radii.xl,
    zIndex:          50,
  },

  // Content
  closeRow: {
    alignItems:      'flex-end',
    paddingVertical: spacing.xs,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 16,
    color:    colors.fg.muted,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing.sm,
    marginBottom:  spacing.sm,
  },
  starGlyph: {
    fontSize:  typography.sizes.lg,
    color:     colors.accent.gold,
    marginTop: 2,
  },
  title: {
    flex:          1,
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.md,
    color:         colors.fg.primary,
    letterSpacing: typography.tracking.wide,
    lineHeight:    typography.sizes.md * typography.lineHeights.normal,
  },

  description: {
    fontFamily:   typography.fonts.body,
    fontSize:     typography.sizes.base,
    color:        colors.fg.muted,
    lineHeight:   typography.sizes.base * typography.lineHeights.relaxed,
    marginBottom: spacing.sm,
  },

  divider: {
    height:          1,
    backgroundColor: colors.border.default,
    marginVertical:  spacing.md,
  },

  completionSection: { gap: 4 },
  completedLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
  },
  completedDate: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.base,
    color:      colors.fg.primary,
  },

  luxRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginTop:       spacing.sm,
    backgroundColor: colors.bg.card,
    borderRadius:    radii.md,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border.default,
  },
  luxLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
  },
  luxValue: {
    fontFamily:    typography.fonts.mono,
    fontSize:      typography.sizes.lg,
    color:         colors.accent.gold,
    letterSpacing: typography.tracking.wide,
  },

  evidenceSection: { gap: spacing.xs },
  evidenceLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
  },
  evidencePlaceholder: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.sm,
    color:      colors.fg.subtle,
  },
});
