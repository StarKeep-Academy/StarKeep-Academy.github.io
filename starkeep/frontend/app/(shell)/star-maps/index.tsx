/**
 * app/(shell)/star-maps/index.tsx
 *
 * Phase 3 — Star Map screens.
 *
 * Layout: dome header (identical geometry to RadialNav) always visible.
 * Content area below dome varies by state:
 *
 *   empty  → EmptyStarMap  (wireframe image 1: + button + arc)
 *            → GoalInputSheet  (wireframe image 2: gold orb + suggestions)
 *   loaded → zoom navigation (0 = NorthStar, 1 = FullSky, 2 = Constellation, 3 = StarDetail)
 *
 * Phase 4 will wire GoalInputSheet to the creation API.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../../features/auth/store';
import { useAvatar } from '../../../features/avatar/index';
import {
  useStarMap,
  type StarMap,
  type Constellation,
  type Star,
} from '../../../features/starmap/index';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';
import { NorthStarScreen }    from '../../../features/starmap/components/NorthStarScreen';
import { FullSkyView }        from '../../../features/starmap/components/FullSkyView';
import { ConstellationView }  from '../../../features/starmap/components/ConstellationView';
import { StarDetailPanel }    from '../../../features/starmap/components/StarDetailPanel';

// ─── Zoom state ───────────────────────────────────────────────────────────────

type ZoomState =
  | { level: 1 }
  | { level: 0 }
  | { level: 2; constellationId: string }
  | { level: 3; constellationId: string; starId: string };

// ─── Dev mock data ────────────────────────────────────────────────────────────

const DEV_STAR_MAP: StarMap = {
  avatar_id:           '00000000-0000-0000-0000-000000000002',
  total_stars:         3,
  total_constellations: 1,
  constellation_paths: [
    {
      id:   '00000000-0000-0000-0000-000000000010',
      name: 'Digital Futures Arc',
      constellations: [
        {
          id:           '00000000-0000-0000-0000-000000000020',
          name:         'Creative Technology',
          symbol:       'wolf',
          completed_at: '2026-03-01T00:00:00Z',
          angle_deg:    45,
          radius:       0.70,
          is_north_star: false,
          stars: [
            { id: '00000000-0000-0000-0000-000000000030', title: 'Completed 3D Printing 101',      description: 'Built and operated a FDM printer for rapid prototyping.', completed_at: '2026-02-01T00:00:00Z', lux_issued: 14, x: 0.25, y: 0.30 },
            { id: '00000000-0000-0000-0000-000000000031', title: 'Built a sustainable lamp prototype', description: 'Designed a solar-powered lamp from recycled materials.',  completed_at: '2026-02-15T00:00:00Z', lux_issued: 16, x: 0.72, y: 0.28 },
            { id: '00000000-0000-0000-0000-000000000032', title: 'Distributed lamps to 5 households', description: 'Community distribution with photographic evidence.',       completed_at: '2026-03-01T00:00:00Z', lux_issued: 22, x: 0.50, y: 0.72 },
          ],
        },
      ],
    },
  ],
  pending_milestones: [
    { id: '00000000-0000-0000-0000-000000000040', title: 'Plant a community garden',           status: 'active',    validation_status: 'not_submitted',  constellation_id: null },
    { id: '00000000-0000-0000-0000-000000000041', title: 'Document solar panel installation',  status: 'submitted', validation_status: 'pending_review', constellation_id: '00000000-0000-0000-0000-000000000020' },
    { id: '00000000-0000-0000-0000-000000000042', title: 'Community water filtration proposal', status: 'rejected', validation_status: 'rejected',       constellation_id: null, rejection_feedback: 'Please add more evidence photos of the installation process.' },
  ],
};

// Toggle this to test the empty state in dev:
// const DEV_DATA = { ...DEV_STAR_MAP, constellation_paths: [], pending_milestones: [] };
const DEV_DATA = DEV_STAR_MAP;

// ─── Goal input mock suggestions ─────────────────────────────────────────────

const GOAL_SUGGESTIONS = [
  'Create a gamified sustainability app',
  'Build a farming robot',
  'Create a community townhall',
  'Design an urban food forest',
  'Develop renewable energy curriculum',
  'Build accessible tech for elderly',
  'Launch a youth coding program',
];

// ─── Dome geometry (same formula as RadialNav) ───────────────────────────────

function useDome() {
  const { width: W, height: H } = useWindowDimensions();
  const { top: safeTop }        = useSafeAreaInsets();

  return useMemo(() => {
    const cx   = W / 2;
    const arcH = H / 3;
    const R    = Math.max(W * 0.76, 400);
    const cy   = arcH - R;
    return { W, H, cx, cy, R, arcH, safeTop };
  }, [W, H, safeTop]);
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StarMapsScreen() {
  const avatarId = useAuthStore(s => s.avatarId);
  const { data: starMap, isLoading, isError, error } = useStarMap(avatarId ?? '');
  const { data: avatar } = useAvatar(avatarId ?? '');

  const [zoom,          setZoom]          = useState<ZoomState>({ level: 1 });
  const [showGoalInput, setShowGoalInput] = useState(false);
  const contentOpacity = useRef(new Animated.Value(1)).current;

  const dome        = useDome();
  const orbitRadius = dome.H / 2 - dome.cy;

  const isConnectionRefused =
    __DEV__ && isError && (error as Error)?.message === 'Failed to fetch';
  const displayData = isConnectionRefused ? DEV_DATA : starMap;
  const showError   = isError && !isConnectionRefused;

  const isEmpty =
    displayData &&
    displayData.constellation_paths.length === 0 &&
    displayData.pending_milestones.length === 0;

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const goToNorthStar    = () => setZoom({ level: 0 });
  const goToSky          = () => setZoom({ level: 1 });
  const goToConstellation = (id: string)  => setZoom({ level: 2, constellationId: id });
  const goToStar         = (cid: string, sid: string) =>
    setZoom({ level: 3, constellationId: cid, starId: sid });

  // Derive selected data from zoom state
  const selectedConstellation: Constellation | undefined = useMemo(() => {
    if (!displayData) return undefined;
    if (zoom.level !== 2 && zoom.level !== 3) return undefined;
    return displayData.constellation_paths
      .flatMap(p => p.constellations)
      .find(c => c.id === zoom.constellationId);
  }, [displayData, zoom]);

  const selectedStar: Star | undefined = useMemo(() => {
    if (zoom.level !== 3) return undefined;
    return selectedConstellation?.stars.find(s => s.id === zoom.starId);
  }, [selectedConstellation, zoom]);

  const pendingForConstellation = useMemo(() => {
    if (!displayData || (zoom.level !== 2 && zoom.level !== 3)) return [];
    return displayData.pending_milestones.filter(
      m => m.constellation_id === (zoom as { constellationId: string }).constellationId
    );
  }, [displayData, zoom]);

  // ── Zoom transition animation ──────────────────────────────────────────────

  useEffect(() => {
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue:         1,
      duration:        280,
      useNativeDriver: true,
    }).start();
  }, [zoom.level, showGoalInput]);

  // ── Zoom header state ──────────────────────────────────────────────────────

  const zoomLabel =
    zoom.level === 0 ? 'NORTH STAR'
    : zoom.level === 2 || zoom.level === 3 ? (selectedConstellation?.name.toUpperCase() ?? 'CONSTELLATION')
    : null;  // null = show "STAR MAPS" (levels 1 + empty state)

  const canGoBack = zoom.level !== 1 || showGoalInput;

  const handleBack = () => {
    if (showGoalInput) { setShowGoalInput(false); return; }
    if (zoom.level === 0) { setZoom({ level: 1 }); return; }
    if (zoom.level === 2) { setZoom({ level: 1 }); return; }
    if (zoom.level === 3) { setZoom({ level: 2, constellationId: (zoom as any).constellationId }); return; }
    router.back();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* Dome — absolute, always on top ─────────────────────────────────── */}
      <View pointerEvents="none" style={{
        position:        'absolute',
        width:           dome.R * 2,
        height:          dome.R * 2,
        borderRadius:    dome.R,
        backgroundColor: colors.bg.dome,
        left:            dome.cx - dome.R,
        top:             dome.cy - dome.R,
      }} />

      {/* Arc outline — very subtle ring just outside the dome */}
      <View pointerEvents="none" style={{
        position:        'absolute',
        width:           dome.R * 2 + 6,
        height:          dome.R * 2 + 6,
        borderRadius:    dome.R + 3,
        borderWidth:     1,
        borderColor:     'rgba(210,220,255,0.14)',
        backgroundColor: 'transparent',
        left:            dome.cx - dome.R - 3,
        top:             dome.cy - dome.R - 3,
      }} />

      {/* Dome title */}
      <View pointerEvents="none" style={{
        position:   'absolute',
        top:        dome.arcH * 0.28,
        left:       0,
        right:      0,
        alignItems: 'center',
      }}>
        <Text style={styles.domeTitle}>
          {zoomLabel ?? 'STAR MAPS'}
        </Text>
      </View>

      {/* Back / close button */}
      {canGoBack && (
        <Pressable
          style={{ position: 'absolute', top: dome.safeTop + 16, left: 16, zIndex: 20 }}
          onPress={handleBack}
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
      )}

      {/* Dev banner */}
      {isConnectionRefused && (
        <View style={[styles.devBanner, { top: dome.arcH }]}>
          <Text style={styles.devBannerText}>DEV — MOCK DATA</Text>
        </View>
      )}

      {/* ── Content area — padded to start below dome ───────────────────── */}
      <Animated.View style={[styles.content, { paddingTop: dome.arcH + (isConnectionRefused ? 24 : 0), opacity: contentOpacity }]}>

        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.accent.cyan} />
            <Text style={styles.loadingText}>LOADING STAR MAP</Text>
          </View>
        )}

        {showError && (
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>UNABLE TO LOAD</Text>
            <Text style={styles.errorDetail}>{(error as Error)?.message}</Text>
          </View>
        )}

        {!isLoading && !showError && displayData && (
          <>
            {/* ── EMPTY STATE ─────────────────────────────────────────── */}
            {isEmpty && !showGoalInput && (
              <EmptyStarMap
                onCreateConstellation={() => setShowGoalInput(true)}
                dome={dome}
              />
            )}

            {/* ── GOAL INPUT (stub — Phase 4 will wire creation API) ─── */}
            {isEmpty && showGoalInput && (
              <GoalInputSheet
                onDismiss={() => setShowGoalInput(false)}
                dome={dome}
              />
            )}

            {/* ── POPULATED — ZOOM 0: North Star ─────────────────────── */}
            {!isEmpty && zoom.level === 0 && (
              <NorthStarScreen
                starMap={displayData}
                avatar={avatar}
                onOpenSky={goToSky}
                onOpenConstellation={goToConstellation}
              />
            )}

            {/* ── POPULATED — ZOOM 1: Full Sky ───────────────────────── */}
            {!isEmpty && zoom.level === 1 && (
              <FullSkyView
                starMap={displayData}
                onSelectConstellation={goToConstellation}
                onOpenNorthStar={goToNorthStar}
              />
            )}

            {/* ── POPULATED — ZOOM 2: Constellation ─────────────────── */}
            {!isEmpty && zoom.level === 2 && selectedConstellation && (
              <ConstellationView
                constellation={selectedConstellation}
                pendingMilestones={pendingForConstellation}
                onBack={() => setZoom({ level: 1 })}
                onSelectStar={sid =>
                  goToStar((zoom as { constellationId: string }).constellationId, sid)
                }
              />
            )}

            {/* ── POPULATED — ZOOM 3: Star expanded ─────────────────── */}
            {!isEmpty && zoom.level === 3 && selectedConstellation && (
              <>
                <ConstellationView
                  constellation={selectedConstellation}
                  pendingMilestones={pendingForConstellation}
                  onBack={() => setZoom({ level: 2, constellationId: (zoom as any).constellationId })}
                  onSelectStar={sid =>
                    goToStar((zoom as any).constellationId, sid)
                  }
                />
                {selectedStar && (
                  <StarDetailPanel
                    star={selectedStar}
                    onClose={() => setZoom({ level: 2, constellationId: (zoom as any).constellationId })}
                  />
                )}
              </>
            )}
          </>
        )}
      </Animated.View>

      {/* Orbit ring — concentric with dome, southern tip at screen center */}
      <View
        pointerEvents="none"
        style={{
          position:        'absolute',
          width:           orbitRadius * 2,
          height:          orbitRadius * 2,
          borderRadius:    orbitRadius,
          borderWidth:     1,
          borderColor:     'rgba(45,108,223,0.28)',
          backgroundColor: 'transparent',
          left:            dome.W / 2 - orbitRadius,
          top:             dome.cy - orbitRadius,
        }}
      />
    </View>
  );
}

// ─── Empty State (wireframe image 1) ─────────────────────────────────────────

function EmptyStarMap({
  onCreateConstellation,
  dome,
}: {
  onCreateConstellation: () => void;
  dome: ReturnType<typeof useDome>;
}) {
  const pulseAnim = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.45, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const btnSize  = 68;
  const ringSize = btnSize + 18;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.plusWrapper} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
          onPress={onCreateConstellation}
        >
          {/* Pulsing outer glow */}
          <Animated.View style={[styles.plusGlow, { width: ringSize + 16, height: ringSize + 16, borderRadius: (ringSize + 16) / 2, opacity: pulseAnim }]} />

          {/* Gold ring */}
          <View style={[styles.plusRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
            {/* Dark inner circle */}
            <View style={[styles.plusInner, { width: btnSize, height: btnSize, borderRadius: btnSize / 2 }]}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </View>
        </Pressable>

        <Text style={styles.createLabel}>create new constellation</Text>
      </View>
    </View>
  );
}

// ─── Goal Input Sheet (wireframe image 2, Phase 4 stub) ──────────────────────

function GoalInputSheet({
  onDismiss,
  dome,
}: {
  onDismiss: () => void;
  dome:      ReturnType<typeof useDome>;
}) {
  const [selected, setSelected] = useState<number | null>(0);

  return (
    <View style={styles.goalContainer}>
      {/* Gold North Star orb */}
      <View style={styles.goalOrb} />

      {/* Label */}
      <Text style={styles.goalLabel}>What is your goal?:</Text>

      {/* Suggestion list */}
      <View style={styles.goalList}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.goalListContent}
        >
          {GOAL_SUGGESTIONS.map((g, i) => (
            <Pressable
              key={g}
              style={[
                styles.goalItem,
                i < GOAL_SUGGESTIONS.length - 1 && styles.goalItemBorder,
                selected === i && styles.goalItemSelected,
              ]}
              onPress={() => setSelected(i)}
            >
              <Text style={[
                styles.goalItemText,
                selected === i && { color: colors.fg.primary },
              ]}>
                {g}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Phase 4 note */}
      <Text style={styles.goalPhaseNote}>
        Goal creation arrives in Phase 4 — selection is a preview.
      </Text>

      <Pressable style={styles.goalDismiss} onPress={onDismiss}>
        <Text style={styles.goalDismissText}>← BACK</Text>
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

  // Dome text
  domeTitle: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xl,
    color:         colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    textAlign:     'center',
  },
  backArrow: {
    fontSize: 22,
    color:    colors.fg.primary,
    padding:  spacing.sm,
  },

  // Dev banner
  devBanner: {
    position:         'absolute',
    left:             0,
    right:            0,
    backgroundColor:  colors.semantic.warning,
    paddingVertical:  2,
    alignItems:       'center',
  },
  devBannerText: {
    fontFamily:    typography.fonts.mono,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.inverse,
    letterSpacing: typography.tracking.wide,
  },

  // Content area
  content: {
    flex: 1,
  },

  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.md,
    padding:        spacing.xl,
  },
  loadingText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.widest,
    marginTop:     spacing.sm,
  },
  errorTitle: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.md,
    color:         colors.semantic.danger,
    letterSpacing: typography.tracking.wider,
  },
  errorDetail: {
    fontFamily:  typography.fonts.body,
    fontSize:    typography.sizes.sm,
    color:       colors.fg.muted,
    textAlign:   'center',
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  plusWrapper: {
    position:       'absolute',
    bottom:         '18%',
    left:           0,
    right:          0,
    alignItems:     'center',
    gap:            spacing.md,
  },
  plusGlow: {
    position:        'absolute',
    alignSelf:       'center',
    backgroundColor: 'rgba(232,177,74,0.22)',
  },
  plusRing: {
    borderWidth:     2,
    borderColor:     colors.accent.gold,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'transparent',
  },
  plusInner: {
    backgroundColor: colors.bg.surface,
    alignItems:      'center',
    justifyContent:  'center',
  },
  plusText: {
    fontSize:  32,
    color:     colors.fg.primary,
    fontWeight: '300',
    lineHeight: 36,
  },
  createLabel: {
    fontFamily:    typography.fonts.body,
    fontSize:      typography.sizes.sm,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },

  // ── Goal input sheet ───────────────────────────────────────────────────────
  goalContainer: {
    flex:            1,
    alignItems:      'center',
    paddingTop:      spacing.xl,
    paddingHorizontal: spacing.lg,
    gap:             spacing.md,
  },
  goalOrb: {
    width:           90,
    height:          90,
    borderRadius:    45,
    backgroundColor: colors.accent.gold,
    shadowColor:     colors.accent.gold,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.6,
    shadowRadius:    20,
    elevation:       10,
    marginBottom:    spacing.sm,
  },
  goalLabel: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.sm,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wider,
    marginBottom:  spacing.xs,
  },
  goalList: {
    width:           '100%',
    maxHeight:       320,
    backgroundColor: colors.bg.surface,
    borderRadius:    radii.lg,
    borderWidth:     1,
    borderColor:     colors.border.default,
    overflow:        'hidden',
  },
  goalListContent: {
    paddingVertical: spacing.xs,
  },
  goalItem: {
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
  },
  goalItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  goalItemSelected: {
    backgroundColor: colors.bg.card,
  },
  goalItemText: {
    fontFamily: typography.fonts.body,
    fontSize:   typography.sizes.base,
    color:      colors.fg.muted,
    textAlign:  'center',
  },
  goalPhaseNote: {
    fontFamily:  typography.fonts.body,
    fontSize:    typography.sizes.xs,
    color:       colors.fg.subtle,
    textAlign:   'center',
    fontStyle:   'italic',
  },
  goalDismiss: {
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  goalDismissText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },
});
