/**
 * features/starmap/components/ConstellationView.tsx
 *
 * Zoom 2 — Constellation Focus.
 * Shows star nodes positioned via x/y hints, connected by dim lines.
 * Tapping a star opens StarDetailPanel (Zoom 3).
 * Pending milestones for this constellation are listed below the canvas.
 *
 * STARMAP_SPEC §4 — connecting lines drawn via rotated View (no SVG required).
 * Phase 4 adds: mitosis, star creation, orbital planets.
 */

import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, typography, spacing, radii, statusColors } from '../../../design-system/tokens';
import type { Constellation, Star, PendingMilestone } from '../index';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  constellation:     Constellation;
  pendingMilestones: PendingMilestone[];  // filtered to this constellation
  onBack:            () => void;
  onSelectStar:      (starId: string) => void;
}

// ─── Line connector (no SVG) ──────────────────────────────────────────────────

function StarLine({
  from,
  to,
  canvasW,
  canvasH,
  isLit,
}: {
  from:    Star;
  to:      Star;
  canvasW: number;
  canvasH: number;
  isLit:   boolean;
}) {
  const x1 = from.x * canvasW;
  const y1 = from.y * canvasH;
  const x2 = to.x   * canvasW;
  const y2 = to.y   * canvasH;

  const dx     = x2 - x1;
  const dy     = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx     = (x1 + x2) / 2;
  const cy     = (y1 + y2) / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position:        'absolute',
        width:           length,
        height:          1,
        backgroundColor: isLit
          ? 'rgba(168,230,255,0.55)'
          : 'rgba(255,255,255,0.13)',
        left:            cx - length / 2,
        top:             cy,
        transformOrigin: '50% 0%',
        transform:       [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

// ─── Star node ────────────────────────────────────────────────────────────────

const NODE_R = 14;

function StarNode({
  star,
  canvasW,
  canvasH,
  onPress,
}: {
  star:    Star;
  canvasW: number;
  canvasH: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.starNode,
        {
          left: star.x * canvasW - NODE_R,
          top:  star.y * canvasH - NODE_R,
        },
      ]}
      onPress={onPress}
    >
      {/* Outer glow ring */}
      <View style={styles.starGlow} />
      {/* Core */}
      <View style={styles.starCore}>
        <Text style={styles.starCoreGlyph}>★</Text>
      </View>
    </Pressable>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_CANVAS_H = 280;

export function ConstellationView({ constellation, pendingMilestones, onBack, onSelectStar }: Props) {
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: DEFAULT_CANVAS_H });

  // Ensure stars have valid x/y — fall back to distributed layout
  const stars: Star[] = useMemo(() => {
    return constellation.stars.map((s, i) => ({
      ...s,
      x: s.x ?? (i + 1) / (constellation.stars.length + 1),
      y: s.y ?? 0.3 + (i % 2) * 0.4,
    }));
  }, [constellation.stars]);

  const isComplete = !!constellation.completed_at;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Constellation info */}
      <View style={styles.header}>
        <View style={styles.headerMeta}>
          <Text style={styles.constellationName}>{constellation.name}</Text>
          {constellation.symbol ? (
            <Text style={styles.constellationSymbol}>
              {constellation.symbol.toUpperCase()}
            </Text>
          ) : null}
        </View>
        <View style={[
          styles.statusPill,
          { borderColor: isComplete ? colors.semantic.success : colors.accent.blue },
        ]}>
          <Text style={[
            styles.statusPillText,
            { color: isComplete ? colors.semantic.success : colors.accent.blue },
          ]}>
            {isComplete ? 'COMPLETE' : 'IN PROGRESS'}
          </Text>
        </View>
      </View>

      {/* Star canvas */}
      <View
        style={styles.canvas}
        onLayout={e => setCanvasSize({
          w: e.nativeEvent.layout.width,
          h: DEFAULT_CANVAS_H,
        })}
      >
        {/* Connecting lines — drawn first so nodes appear above */}
        {stars.slice(0, -1).map((s, i) => (
          <StarLine
            key={`line-${s.id}-${stars[i + 1].id}`}
            from={s}
            to={stars[i + 1]}
            canvasW={canvasSize.w}
            canvasH={DEFAULT_CANVAS_H}
            isLit={isComplete}
          />
        ))}

        {/* Star nodes */}
        {stars.map(star => (
          <StarNode
            key={star.id}
            star={star}
            canvasW={canvasSize.w}
            canvasH={DEFAULT_CANVAS_H}
            onPress={() => onSelectStar(star.id)}
          />
        ))}

        {stars.length === 0 && (
          <View style={styles.emptyCanvas}>
            <Text style={styles.emptyCanvasText}>NO STARS EARNED YET</Text>
          </View>
        )}
      </View>

      {/* Star list */}
      {stars.length > 0 && (
        <View style={styles.starList}>
          <Text style={styles.sectionHeading}>EARNED STARS</Text>
          {stars.map(star => {
            const date = new Date(star.completed_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <Pressable
                key={star.id}
                style={({ pressed }) => [styles.starRow, pressed && { opacity: 0.7 }]}
                onPress={() => onSelectStar(star.id)}
              >
                <Text style={styles.starRowGlyph}>★</Text>
                <View style={styles.starRowInfo}>
                  <Text style={styles.starRowTitle}>{star.title}</Text>
                  <Text style={styles.starRowDate}>{date}</Text>
                </View>
                {star.lux_issued > 0 && (
                  <Text style={styles.starRowLux}>+{star.lux_issued} LUX</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Pending milestones for this constellation */}
      {pendingMilestones.length > 0 && (
        <View style={styles.pendingList}>
          <Text style={styles.sectionHeading}>IN PROGRESS</Text>
          {pendingMilestones.map(m => {
            const statusClr = statusColors[m.status] ?? colors.fg.muted;
            return (
              <View key={m.id} style={styles.pendingRow}>
                <View style={styles.pendingRowInfo}>
                  <Text style={styles.pendingRowTitle}>{m.title}</Text>
                  {m.status === 'rejected' && m.rejection_feedback ? (
                    <Text style={styles.rejectionNote}>{m.rejection_feedback}</Text>
                  ) : null}
                </View>
                <View style={[styles.pendingPill, { borderColor: statusClr }]}>
                  <Text style={[styles.pendingPillText, { color: statusClr }]}>
                    {m.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     100,
    gap:               spacing.lg,
  },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingTop:     spacing.md,
  },
  headerMeta: { flex: 1, gap: 2 },
  constellationName: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.md,
    color:         colors.fg.primary,
    letterSpacing: typography.tracking.wide,
  },
  constellationSymbol: {
    fontFamily:    typography.fonts.body,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radii.full,
    borderWidth:       1,
  },
  statusPillText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    letterSpacing: typography.tracking.wide,
  },

  // Canvas — transparent so stars float on the app background
  canvas: {
    width:           '100%',
    height:          DEFAULT_CANVAS_H,
    backgroundColor: 'transparent',
    position:        'relative',
    overflow:        'hidden',
  },
  emptyCanvas: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyCanvasText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.subtle,
    letterSpacing: typography.tracking.widest,
  },

  // Star nodes
  starNode: {
    position:       'absolute',
    width:          NODE_R * 2,
    height:         NODE_R * 2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  starGlow: {
    position:     'absolute',
    width:        NODE_R * 2 + 8,
    height:       NODE_R * 2 + 8,
    borderRadius: NODE_R + 4,
    backgroundColor: 'rgba(232,177,74,0.15)',
  },
  starCore: {
    width:          NODE_R * 2,
    height:         NODE_R * 2,
    borderRadius:   NODE_R,
    backgroundColor: colors.bg.surface,
    borderWidth:    1.5,
    borderColor:    colors.accent.gold,
    alignItems:     'center',
    justifyContent: 'center',
  },
  starCoreGlyph: {
    fontSize:  9,
    color:     colors.accent.gold,
  },

  // Star list
  starList: { gap: spacing.xs },
  sectionHeading: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
    marginBottom:  spacing.xs,
  },
  starRow: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              spacing.sm,
    paddingVertical:  spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor:  colors.bg.card,
    borderRadius:     radii.sm,
    borderWidth:      1,
    borderColor:      colors.border.default,
  },
  starRowGlyph: {
    fontSize: typography.sizes.xs,
    color:    colors.accent.gold,
  },
  starRowInfo: { flex: 1, gap: 2 },
  starRowTitle: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.base,
    color:      colors.fg.primary,
  },
  starRowDate: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.xs,
    color:      colors.fg.muted,
  },
  starRowLux: {
    fontFamily:    typography.fonts.mono,
    fontSize:      typography.sizes.xs,
    color:         colors.accent.gold,
    letterSpacing: typography.tracking.wide,
  },

  // Pending milestones
  pendingList: { gap: spacing.xs },
  pendingRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    backgroundColor:  colors.bg.card,
    borderRadius:     radii.sm,
    padding:          spacing.sm,
    borderWidth:      1,
    borderColor:      colors.border.default,
  },
  pendingRowInfo: { flex: 1, gap: 2 },
  pendingRowTitle: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.base,
    color:      colors.fg.primary,
  },
  rejectionNote: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.xs,
    color:      colors.semantic.danger,
  },
  pendingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    borderRadius:      radii.full,
    borderWidth:       1,
    marginLeft:        spacing.sm,
  },
  pendingPillText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    letterSpacing: typography.tracking.wide,
  },
});
