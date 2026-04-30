/**
 * design-system/components/RadialNav.tsx
 *
 * Full-screen radial navigation menu. Rendered as its own page (/(shell)/menu).
 *
 * Geometry — dome at TOP of screen:
 *   arcH = screenH / 3  (bottom of visible arc at 1/3 screen height)
 *   R = 0.76·W — uniform sphere: arc subtends ~91° at any screen width.
 *   cy = arcH − R  (sphere centre above screen; only bottom arc visible)
 *   Glyphs equally spaced horizontally: xᵢ = (i+1)·W/(count+1).
 *   Each glyph sits H/6 below its arc intersection → centre glyph lands at H/2.
 *   Needle angle: atan2(dx, yApex−cy) so the arrow aims at each glyph centre.
 *
 * Responsive sizing:
 *   containerW ≤ W/(count+1) prevents glyph containers overlapping on mobile.
 *   glyphSize, triangle, and text scale proportionally with containerW.
 */

import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { colors, typography, spacing } from '../tokens';

// ─── Nav Config ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    id:       'avatar',
    route:    '/(shell)/avatar',
    glyph:    '◈',
    label:    'AVATAR',
    subItems: ['Profile', 'Archetypes', 'Heroic Path', 'Learning Path'],
  },
  {
    id:       'star-maps',
    route:    '/(shell)/star-maps',
    glyph:    '✦',
    label:    'STAR MAPS',
    subItems: ['Create', 'Verify', 'Overview'],
  },
  {
    id:       'academy',
    route:    '/(shell)/academy',
    glyph:    '∞',
    label:    'ACADEMY',
    subItems: ['Campus', 'Classes', 'Alliances'],
  },
  {
    id:       'mission-log',
    route:    '/(shell)/mission-log',
    glyph:    '⬡',
    label:    'MISSION LOG',
    subItems: ['Missions', 'Quests'],
  },
  {
    id:       'lux',
    route:    '/(shell)/lux',
    glyph:    '✧',
    label:    'LUX',
    subItems: ['Wallet', 'Transactions', 'History'],
  },
] as const;

type NavId = typeof NAV_ITEMS[number]['id'];

// ─── Geometry ─────────────────────────────────────────────────────────────────

interface GlyphPoint { x: number; y: number; yApex: number; angle: number }
interface DomeGeometry {
  R:      number;
  cx:     number;
  cy:     number;
  arcH:   number;
  glyphs: GlyphPoint[];
}

function computeDome(screenW: number, screenH: number): DomeGeometry {
  const cx   = screenW / 2;
  const arcH = screenH / 3;

  // Uniform sphere: R ∝ W keeps arc curvature globe-like at every screen size.
  // 0.76·W reaches the top screen corners exactly on 16:9 screens.
  const R  = Math.max(screenW * 0.76, 400);
  const cy = arcH - R;

  // Each glyph centre sits a fixed H/6 below its arc intersection.
  // This places the centre glyph (theta=0) at exactly H/2 on screen and keeps
  // every glyph the same perpendicular distance from the dome regardless of angle.
  const glyphBelowArc = screenH / 6;

  const count  = NAV_ITEMS.length;
  const glyphs = NAV_ITEMS.map((_, i) => {
    const x        = (i + 1) * screenW / (count + 1);
    const dx       = x - cx;
    // Arc intersection for this x position
    const thetaArc = Math.asin(Math.min(1, Math.max(-1, dx / R)));
    const y        = cy + R * Math.cos(thetaArc);
    // Glyph centre: fixed gap below arc so all glyphs equally spaced from dome
    const yApex    = y + glyphBelowArc;
    // Needle aims from pivot (cx, cy) toward glyph centre via atan2
    const theta    = Math.atan2(dx, yApex - cy);
    // Negated so positive rotation = rightward on screen (empirically confirmed).
    const angle    = -theta * (180 / Math.PI);
    return { x, y, yApex, angle };
  });

  return { R, cx, cy, arcH, glyphs };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RadialNav() {
  const { width: W, height: H } = useWindowDimensions();
  const [activeId, setActiveId] = useState<NavId | null>(null);

  const dome      = useMemo(() => computeDome(W, H), [W, H]);
  const activeIdx = activeId ? NAV_ITEMS.findIndex(n => n.id === activeId) : 2;

  const needleAnim = useRef(new Animated.Value(2)).current;

  useEffect(() => {
    Animated.spring(needleAnim, {
      toValue:         activeIdx,
      tension:         55,
      friction:        8,
      useNativeDriver: false,
    }).start();
  }, [activeIdx]);

  const idxRange     = dome.glyphs.map((_, i) => i);
  const needleRotate = needleAnim.interpolate({
    inputRange:  idxRange,
    outputRange: dome.glyphs.map(g => `${g.angle}deg`),
  });

  const handleSelect = useCallback((id: NavId) => {
    setActiveId(id);
  }, []);

  const handleGlyphPress = useCallback((item: typeof NAV_ITEMS[number]) => {
    if (activeId === item.id) {
      router.push(item.route as any);
    } else {
      setActiveId(item.id as NavId);
    }
  }, [activeId]);

  const handleEnter = useCallback((item: typeof NAV_ITEMS[number]) => {
    router.push(item.route as any);
  }, []);

  const activeItem = NAV_ITEMS.find(n => n.id === activeId) ?? null;

  // ── Responsive sizes ──────────────────────────────────────────────────────
  // containerW ≤ W/(count+1) so adjacent containers never overlap.
  // All other sizes scale with containerW; caps preserve desktop appearance.
  const containerW = Math.min(130, Math.floor(W / (NAV_ITEMS.length + 1)));
  const glyphSize  = Math.min(110, Math.floor(containerW * 0.85));
  const textSize   = Math.max(8,   Math.min(10, Math.floor(containerW * 0.13)));

  // Triangle scales with W, capped at the original desktop values
  const triSide = Math.min(30, Math.max(12, Math.floor(W * 0.04)));
  const triH    = Math.min(50, Math.max(20, Math.floor(W * 0.065)));
  const needleW = triSide * 2 + 2;

  // Needle pivot: centre at (cx, cy) above screen
  const needleH   = dome.R * 2;
  const needleTop = dome.cy - dome.R;   // = arcH - 2R (large negative)

  return (
    <View style={styles.container}>

      {/* Blue dome — centre above screen, only bottom arc visible */}
      <View
        pointerEvents="none"
        style={{
          position:        'absolute',
          width:           dome.R * 2,
          height:          dome.R * 2,
          borderRadius:    dome.R,
          backgroundColor: colors.bg.dome,
          left:            dome.cx - dome.R,
          top:             needleTop,
        }}
      />

      {/* Title inside dome */}
      <View
        pointerEvents="none"
        style={[styles.domeTitleWrap, { top: dome.arcH * 0.28 }]}
      >
        {activeItem ? (
          <Text style={styles.domeTitle}>{activeItem.label}</Text>
        ) : (
          <Image
            source={require('../../assets/images/Starkeep_v2.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Invisible needle — rotates around cy; carries the triangle tip */}
      <Animated.View
        pointerEvents="none"
        style={{
          position:  'absolute',
          width:     needleW,
          height:    needleH,
          left:      dome.cx - needleW / 2,
          top:       needleTop,
          transform: [{ rotate: needleRotate }],
        }}
      >
        {/* Triangle: base at circle perimeter, tip points outward toward glyph */}
        <View
          style={{
            position:          'absolute',
            top:               needleH,
            left:              (needleW - triSide * 2) / 2,
            width:             0,
            height:            0,
            borderLeftWidth:   triSide,
            borderRightWidth:  triSide,
            borderTopWidth:    triH,
            borderLeftColor:   'transparent',
            borderRightColor:  'transparent',
            borderTopColor:    colors.accent.cyan,
          }}
        />
      </Animated.View>

      {/* Glyph buttons — equally spaced, each H/6 below its arc point */}
      {NAV_ITEMS.map((item, idx) => {
        const g        = dome.glyphs[idx];
        const isActive = activeId === item.id;

        return (
          <View
            key={item.id}
            style={{
              position:   'absolute',
              left:       g.x - containerW / 2,
              top:        g.yApex - glyphSize / 2,
              width:      containerW,
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={() => handleGlyphPress(item)}
              // @ts-ignore — onHoverIn is web-only; RN types may not expose it
              onHoverIn={() => handleSelect(item.id as NavId)}
              style={({ pressed }) => [pressed && styles.glyphBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
            >
              <Text style={[
                styles.glyphSymbol,
                { fontSize: glyphSize },
                isActive && styles.glyphSymbolActive,
              ]}>
                {item.glyph}
              </Text>
            </Pressable>

            <Text style={[
              styles.glyphLabel,
              { fontSize: textSize },
              isActive && styles.glyphLabelActive,
            ]}>
              {item.label}
            </Text>

            {isActive && (
              <View style={styles.subItemsWrap}>
                {item.subItems.map(sub => (
                  <Pressable
                    key={sub}
                    onPress={() => handleEnter(item)}
                    style={({ pressed }) => [styles.subItem, pressed && { opacity: 0.65 }]}
                  >
                    <Text style={[styles.subText, { fontSize: textSize }]}>{sub}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* Settings — top-right corner near dome edge */}
      <Pressable
        style={[styles.settingsBtn, { top: dome.arcH - 26, right: 14 }]}
        onPress={() => router.push('/(shell)/settings' as any)}
        accessibilityLabel="Open settings"
      >
        <Text style={styles.settingsGlyph}>⚙</Text>
      </Pressable>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg.base,
    overflow:        'hidden',
  },

  // Dome title
  domeTitleWrap: {
    position:   'absolute',
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  domeTitle: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xl,
    color:         colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    textAlign:     'center',
  },
  logoImage: {
    width:  240,
    height: 90,
  },

  // Glyphs — fontSize is applied inline so it can be responsive
  glyphBtnPressed: {
    opacity: 0.65,
  },
  glyphSymbol: {
    color:     colors.fg.muted,
    textAlign: 'center',
  },
  glyphSymbolActive: {
    color:            colors.accent.cyan,
    textShadowColor:  colors.accent.cyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  glyphLabel: {
    fontFamily:    typography.fonts.display,
    color:         colors.fg.subtle,
    letterSpacing: typography.tracking.wider,
    textAlign:     'center',
    marginTop:     2,
  },
  glyphLabelActive: {
    color: colors.fg.primary,
  },

  // Sub-items — fontSize applied inline
  subItemsWrap: {
    alignItems: 'center',
    marginTop:  spacing.sm,
    gap:        2,
  },
  subItem: {
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  subText: {
    fontFamily:    typography.fonts.display,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wide,
    textAlign:     'center',
  },

  // Settings
  settingsBtn: {
    position: 'absolute',
    padding:  spacing.sm,
  },
  settingsGlyph: {
    fontSize: 16,
    color:    colors.fg.muted,
  },
});
