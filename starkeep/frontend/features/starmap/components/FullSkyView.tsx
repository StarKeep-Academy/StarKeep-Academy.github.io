/**
 * features/starmap/components/FullSkyView.tsx
 *
 * Zoom 1 — Full Sky View.
 * Shows all constellations positioned radially from the North Star.
 * Constellations are positioned using stored angle_deg + radius, or auto-distributed
 * around a circle when those fields are null (dev/early data).
 *
 * STARMAP_SPEC §3 — read only. Phase 4 adds pan gestures + creation flow.
 */

import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { NorthStarIcon } from './NorthStarIcon';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';
import type { StarMap, Constellation } from '../index';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  starMap:              StarMap;
  onSelectConstellation: (id: string) => void;
  onOpenNorthStar:      () => void;
}

// ─── Sky canvas helpers ───────────────────────────────────────────────────────

function getPosition(
  c: Constellation,
  index: number,
  total: number,
  canvasSize: number
): { x: number; y: number } {
  // Use stored angle/radius or fall back to even radial distribution
  const angleDeg = c.angle_deg ?? (360 / total) * index - 90;
  const radius   = c.radius   ?? 0.68;

  const angleRad = (angleDeg - 90) * (Math.PI / 180);  // -90 so 0° = top
  const maxR     = canvasSize * 0.38;
  const cx       = canvasSize / 2;
  const cy       = canvasSize / 2;

  return {
    x: cx + Math.cos(angleRad) * maxR * radius,
    y: cy + Math.sin(angleRad) * maxR * radius,
  };
}

function constellationStatus(c: Constellation): 'complete' | 'in_progress' | 'incomplete' {
  if (c.completed_at) return 'complete';
  if (c.stars.length > 0) return 'in_progress';
  return 'incomplete';
}

// ─── Constellation node on canvas ────────────────────────────────────────────

const NODE_SIZE = 56;

function ConstellationNode({
  constellation,
  pos,
  onPress,
}: {
  constellation: Constellation;
  pos: { x: number; y: number };
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const status      = constellationStatus(constellation);
  const nodeColor   = status === 'complete'    ? colors.semantic.success
                    : status === 'in_progress' ? colors.accent.cyan
                    : colors.fg.subtle;
  const borderOpacity = status === 'incomplete' ? 0.3 : 0.9;

  return (
    <Pressable
      style={[
        styles.nodeWrapper,
        {
          left: pos.x - NODE_SIZE / 2,
          top:  pos.y - NODE_SIZE / 2,
        },
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {/* Glow ring */}
      <View
        style={[
          styles.nodeRing,
          {
            borderColor: nodeColor,
            opacity:     borderOpacity,
          },
        ]}
      />
      {/* Star count badge */}
      <Text style={[styles.nodeCount, { color: nodeColor }]}>
        {constellation.stars.length}
      </Text>
      {/* Name label — always 2 lines on mobile, full on web hover */}
      <Text
        style={[styles.nodeLabel, hovered && styles.nodeLabelHovered]}
        numberOfLines={Platform.OS === 'web' && hovered ? undefined : 2}
      >
        {constellation.name}
      </Text>
    </Pressable>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FullSkyView({ starMap, onSelectConstellation, onOpenNorthStar }: Props) {
  const [canvasSize, setCanvasSize] = useState(320);

  const allConstellations = useMemo(
    () => starMap.constellation_paths.flatMap(p => p.constellations),
    [starMap]
  );

  const positions = useMemo(
    () => allConstellations.map((c, i) =>
      getPosition(c, i, allConstellations.length, canvasSize)
    ),
    [allConstellations, canvasSize]
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Sky canvas */}
      <View
        style={[styles.canvas, { height: canvasSize }]}
        onLayout={e => setCanvasSize(e.nativeEvent.layout.width)}
      >
        {/* North Star at center */}
        <Pressable
          style={[
            styles.northStar,
            { left: canvasSize / 2 - 40, top: canvasSize / 2 - 40 },
          ]}
          onPress={onOpenNorthStar}
        >
          <NorthStarIcon size={80} />
        </Pressable>

        {/* Radial lines from center to each constellation node */}
        {positions.map((pos, i) => {
          const cx    = canvasSize / 2;
          const cy    = canvasSize / 2;
          const dx    = pos.x - cx;
          const dy    = pos.y - cy;
          const full  = Math.sqrt(dx * dx + dy * dy);
          const len   = Math.max(0, full - NODE_SIZE / 2);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          // Midpoint between center and midpoint of the shortened line
          const midX  = cx + (dx / full) * (len / 2);
          const midY  = cy + (dy / full) * (len / 2);

          return (
            <View
              key={`line-${allConstellations[i].id}`}
              pointerEvents="none"
              style={{
                position:        'absolute',
                width:           len,
                height:          1,
                backgroundColor: 'rgba(255,255,255,0.07)',
                left:            midX - len / 2,
                top:             midY,
                transform:       [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}

        {/* Constellation nodes */}
        {allConstellations.map((c, i) => (
          <ConstellationNode
            key={c.id}
            constellation={c}
            pos={positions[i]}
            onPress={() => onSelectConstellation(c.id)}
          />
        ))}
      </View>

      {/* Constellation list below canvas */}
      <View style={styles.listSection}>
        <Text style={styles.listHeading}>CONSTELLATIONS</Text>

        {starMap.constellation_paths.map(path => (
          <View key={path.id} style={styles.pathGroup}>
            <Text style={styles.pathLabel}>{path.name.toUpperCase()}</Text>

            {path.constellations.map(c => {
              const status    = constellationStatus(c);
              const statusClr = status === 'complete'    ? colors.semantic.success
                              : status === 'in_progress' ? colors.accent.cyan
                              : colors.fg.subtle;
              return (
                <Pressable
                  key={c.id}
                  style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                  onPress={() => onSelectConstellation(c.id)}
                >
                  <View style={styles.listRowLeft}>
                    <Text style={styles.listRowName}>{c.name}</Text>
                    {c.symbol ? (
                      <Text style={styles.listRowSymbol}>{c.symbol.toUpperCase()}</Text>
                    ) : null}
                  </View>
                  <View style={styles.listRowRight}>
                    <Text style={[styles.starCount, { color: statusClr }]}>
                      {c.stars.length} ★
                    </Text>
                    <View style={[styles.statusDot, { backgroundColor: statusClr }]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Minimap / North Star button — spec §9 collapsed state */}
      <Pressable style={styles.minimapBtn} onPress={onOpenNorthStar}>
        <Text style={styles.minimapGlyph}>★</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // Sky canvas
  canvas: {
    width:           '100%',
    backgroundColor: colors.bg.base,
    position:        'relative',
  },

  northStar: {
    position:       'absolute',
    width:          80,
    height:         80,
    alignItems:     'center',
    justifyContent: 'center',
  },

  nodeWrapper: {
    position:       'absolute',
    width:          NODE_SIZE,
    height:         NODE_SIZE + 44,  // extra height for 2-line label
    alignItems:     'center',
  },
  nodeRing: {
    width:        NODE_SIZE,
    height:       NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth:  1.5,
    alignItems:   'center',
    justifyContent: 'center',
  },
  nodeCount: {
    position:   'absolute',
    top:        NODE_SIZE / 2 - 9,
    fontFamily: typography.fonts.mono,
    fontSize:   typography.sizes.sm,
  },
  nodeLabel: {
    fontFamily:  typography.fonts.display,
    fontSize:    typography.sizes.xs,
    color:       colors.fg.muted,
    letterSpacing: typography.tracking.wide,
    textAlign:   'center',
    marginTop:   4,
    width:       108,
  },
  nodeLabelHovered: {
    color:           colors.fg.primary,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius:    4,
    paddingHorizontal: 4,
    paddingVertical:   2,
    zIndex:          10,
  },

  // List section
  listSection: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    gap:               spacing.md,
  },
  listHeading: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
    marginBottom:  spacing.xs,
  },
  pathGroup: {
    gap: spacing.xs,
  },
  pathLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.accent.gold,
    letterSpacing: typography.tracking.widest,
    marginBottom:  2,
  },
  listRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    backgroundColor:  colors.bg.surface,
    borderRadius:     radii.md,
    paddingVertical:  spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth:      1,
    borderColor:      colors.border.default,
  },
  listRowLeft: {
    flex: 1,
    gap:  2,
  },
  listRowName: {
    fontFamily: typography.fonts.display,
    fontSize:   typography.sizes.sm,
    color:      colors.fg.primary,
    letterSpacing: typography.tracking.wide,
  },
  listRowSymbol: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.xs,
    color:      colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
  },
  listRowRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  starCount: {
    fontFamily: typography.fonts.mono,
    fontSize:   typography.sizes.xs,
    letterSpacing: typography.tracking.wide,
  },
  statusDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },

  // Minimap button
  minimapBtn: {
    position:       'absolute',
    bottom:         spacing.xl,
    right:          spacing.lg,
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  minimapGlyph: {
    fontSize:         22,
    color:            colors.accent.gold,
    textShadowColor:  colors.accent.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
