/**
 * app/(shell)/star-maps/index.tsx
 *
 * Star Maps screen.
 *
 * Hook wiring:
 *   useStarMapState      — all navigation + data state
 *   useStarMapPan        — pan gestures + smooth lerp
 *   useStarMapAnimations — Animated.loop values for glow + orbit
 *
 * Dome geometry mirrors RadialNav exactly:
 *   arcH = H/3, R = max(W*0.76, 400), cy = arcH − R
 *   A large View circle whose centre sits above the screen produces
 *   the identical responsive arc on every device size.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  useWindowDimensions, Modal, TextInput, Pressable,
} from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';

import { useStarMapState, STAR_OFFSETS, MAX_STARS_PER_CONST }
  from '../../../features/starmap/hooks/useStarMapState';
import { useStarMapPan }
  from '../../../features/starmap/hooks/useStarMapPan';
import { useStarMapAnimations }
  from '../../../features/starmap/hooks/useStarMapAnimations';

import { StarMapCanvas }             from '../../../features/starmap/components/StarMapCanvas';
import { StarDetailPanel }           from '../../../features/starmap/components/StarDetailPanel';
import { NorthStarScreen }           from '../../../features/starmap/components/NorthStarScreen';
import { GoalInputModal }            from '../../../features/starmap/components/GoalInputModal';
import { ConstellationConfirmModal } from '../../../features/starmap/components/ConstellationConfirmModal';

// ─── Dome geometry (mirrors RadialNav exactly) ────────────────────────────────

function useDome() {
  const { width: W, height: H } = useWindowDimensions();
  return useMemo(() => {
    const arcH = H / 3;
    const R    = Math.max(W * 0.76, 400);
    const cy   = arcH - R;
    return { R, cx: W / 2, cy, arcH };
  }, [W, H]);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StarMapScreen() {
  const { width, height } = useWindowDimensions();
  const vertBias = height / 6; // shifts zoom-2 content below the dome
  const insets    = useSafeAreaInsets();
  const dome      = useDome();

  const S     = useStarMapState();
  const pan   = useStarMapPan();
  const anims = useStarMapAnimations();

  // Wire setPanTarget from pan hook into state hook
  useEffect(() => {
    S.setPanTargetRef.current = pan.setPanTarget;
  }, [pan.setPanTarget]);

  // New constellation modal (+ button when hasNorthStar)
  const [showNewConst, setShowNewConst] = useState(false);
  // Add star modal (zoom 2, + button in constellation view)
  const [showAddStar,  setShowAddStar]  = useState(false);

  const domeSubtitle =
    S.zoom === 2 && S.selectedConst !== null
      ? S.constellations[S.selectedConst]?.name ?? ''
      : '';

  const showBack = true;

  const handleBack = () => {
    if (S.showNorthStarScreen) {
      S.setShowNorthStarScreen(false);
    } else if (S.zoom === 2) {
      S.exitConstellation();
    } else {
      router.back();
    }
  };

  const handlePlusPress = () => {
    if (S.hasNorthStar) {
      // North Star already set — open constellation creator
      setShowNewConst(true);
    } else {
      // No North Star yet — open goal-setting flow
      S.setShowGoalModal(true);
    }
  };

  const handleAddConstellation = (name: string) => {
    S.addConstellation(name);
    setShowNewConst(false);
  };

  const expandedStarData = S.expandedStar ? S.getStar(S.expandedStar) : null;

  const constStarCount = S.selectedConst !== null
    ? S.getConstStars(S.selectedConst).length : 0;
  const showAddStarBtn = S.zoom === 2 && S.selectedConst !== null
    && !S.panelOpen && constStarCount < MAX_STARS_PER_CONST;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>

        {/* ── CANVAS (lowest layer) ── */}
        <View style={StyleSheet.absoluteFillObject}>
          <StarMapCanvas state={S} pan={pan} anims={anims} />
        </View>

        {/* ── DOME — same View-circle approach as RadialNav ── */}
        <View
          pointerEvents="none"
          style={{
            position:        'absolute',
            width:           dome.R * 2,
            height:          dome.R * 2,
            borderRadius:    dome.R,
            backgroundColor: colors.bg.dome,
            left:            dome.cx - dome.R,
            top:             dome.cy - dome.R,   // arcH - 2R (large negative)
            zIndex:          10,
          }}
        />

        {/* ── DOME TITLE ── */}
        <View
          pointerEvents="none"
          style={{
            position:   'absolute',
            top:        dome.arcH * 0.28,
            left:       0,
            right:      0,
            zIndex:     11,
            alignItems: 'center',
          }}
        >
          <Text style={styles.domeTitle}>STAR MAPS</Text>
          {domeSubtitle ? (
            <Text style={styles.domeSubtitle}>{domeSubtitle}</Text>
          ) : null}
        </View>

        {/* ── BACK BUTTON ── */}
        {showBack && (
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 10 }]}
            onPress={handleBack}
          >
            <Text style={styles.backBtnText}>← BACK</Text>
          </TouchableOpacity>
        )}

        {/* ── BOTTOM ACTION BUTTON ── */}
        {/* Zoom 0 / 1: create or add a constellation */}
        {S.zoom !== 2 && (
          <View style={styles.plusContainer} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.plusBtn}
              onPress={handlePlusPress}
              activeOpacity={0.8}
            >
              <Svg width={50} height={50} viewBox="0 0 50 50">
                <Circle cx={25} cy={25} r={21}
                  fill="#111827"
                  stroke={colors.accent.gold}
                  strokeWidth={1.5}
                />
                <Circle cx={25} cy={25} r={17}
                  fill="none"
                  stroke="rgba(232,177,74,0.18)"
                  strokeWidth={1}
                />
                <Line x1={25} y1={13} x2={25} y2={37}
                  stroke={colors.accent.gold}
                  strokeWidth={2} strokeLinecap="round"
                />
                <Line x1={13} y1={25} x2={37} y2={25}
                  stroke={colors.accent.gold}
                  strokeWidth={2} strokeLinecap="round"
                />
              </Svg>
              <Text style={styles.plusLabel}>
                {S.hasNorthStar ? 'NEW CONSTELLATION' : 'CREATE CONSTELLATION'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Zoom 2: add a star to the selected constellation */}
        {showAddStarBtn && (
          <View style={styles.plusContainer} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.addStarBtn}
              onPress={() => setShowAddStar(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addStarText}>+ ADD STAR</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── SIDE PANEL ── */}
        <StarDetailPanel
          open={S.panelOpen}
          star={expandedStarData ?? null}
          onClose={S.closeStarPanel}
          onTogglePlanet={S.togglePlanet}
          onAddEvidence={S.addEvidence}
          onSubmit={S.submitStar}
          onAiSplit={(_id) => {
            alert('AI split — connects to starkeep-ai in phase 5');
          }}
        />

        {/* ── NORTH STAR SCREEN ── */}
        <NorthStarScreen
          visible={S.showNorthStarScreen}
          goal={S.northStarGoal}
          lastStarDate="2 days ago"
          mostActiveConst={S.constellations[0]?.name ?? '—'}
          nextStepTitle="BUILD MVP PROTOTYPE"
          nextStepFrom="← DIGITAL FOUNDATION"
          onClose={() => S.setShowNorthStarScreen(false)}
          onNextStepTap={() => {
            S.setShowNorthStarScreen(false);
            if (S.constellations.length > 0) {
              S.enterConstellation(0, vertBias);
              setTimeout(() => S.openStarPanel('s3', width, vertBias), 350);
            }
          }}
        />

        {/* ── GOAL MODAL (sets North Star — first-time only) ── */}
        <GoalInputModal
          visible={S.showGoalModal}
          selectedGoal={S.selectedGoal}
          onSelectGoal={S.setSelectedGoal}
          onConfirm={S.confirmNorthStar}
          onDismiss={() => S.setShowGoalModal(false)}
        />

        {/* ── AI CONSTELLATION CONFIRM MODAL ── */}
        <ConstellationConfirmModal
          visible={S.showConfirmModal}
          suggestion={S.suggestionQueue[0] ?? null}
          constellationIdx={S.constellations.length}
          onConfirm={() =>
            S.suggestionQueue[0] && S.confirmConstellation(S.suggestionQueue[0])
          }
          onDismiss={S.dismissConstellation}
        />

        {/* ── NEW CONSTELLATION MODAL (manual, post-north-star) ── */}
        <NewConstellationModal
          visible={showNewConst}
          constellationIdx={S.constellations.length}
          onConfirm={handleAddConstellation}
          onDismiss={() => setShowNewConst(false)}
        />

        {/* ── ADD STAR MODAL ── */}
        <AddStarModal
          visible={showAddStar}
          starIndex={constStarCount}
          onConfirm={(title) => {
            if (S.selectedConst !== null) S.addStarToConst(S.selectedConst, title);
            setShowAddStar(false);
          }}
          onDismiss={() => setShowAddStar(false)}
        />

      </View>
    </GestureHandlerRootView>
  );
}

// ─── New Constellation Modal ──────────────────────────────────────────────────
// Lets the user manually name and add a constellation to their sky.
// The ghost shape preview uses the same STAR_OFFSETS as the canvas.

function NewConstellationModal({
  visible, constellationIdx, onConfirm, onDismiss,
}: {
  visible:          boolean;
  constellationIdx: number;
  onConfirm:        (name: string) => void;
  onDismiss:        () => void;
}) {
  const [name, setName] = useState('');

  const shapeIdx = constellationIdx % 4;
  const offs     = STAR_OFFSETS[shapeIdx] ?? STAR_OFFSETS[0];
  const SCALE    = 0.36;
  const CX5      = 45;
  const CY5      = 38;

  const handleConfirm = () => {
    if (!name.trim()) return;
    onConfirm(name.trim());
    setName('');
  };

  const handleDismiss = () => {
    setName('');
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={modal.overlay} onPress={handleDismiss}>
        <Pressable style={modal.box} onPress={e => e.stopPropagation()}>

          <Text style={modal.prompt}>ADD A CONSTELLATION</Text>
          <Text style={modal.subPrompt}>
            It will appear in your sky, orbiting your North Star.
          </Text>

          {/* Ghost shape preview */}
          <View style={modal.preview}>
            <Svg width={90} height={64}>
              {offs.slice(0, -1).map((o, i) => {
                const next = offs[i + 1];
                if (!next) return null;
                return (
                  <Line key={`l-${i}`}
                    x1={CX5 + o.x * SCALE} y1={CY5 + o.y * SCALE}
                    x2={CX5 + next.x * SCALE} y2={CY5 + next.y * SCALE}
                    stroke="rgba(168,230,255,0.22)" strokeWidth={0.5}
                  />
                );
              })}
              {offs.map((o, i) => (
                <Circle key={`c-${i}`}
                  cx={CX5 + o.x * SCALE} cy={CY5 + o.y * SCALE}
                  r={2.5} fill="none"
                  stroke="rgba(168,230,255,0.42)" strokeWidth={1}
                />
              ))}
            </Svg>
          </View>

          {/* Name input */}
          <Text style={modal.inputLabel}>CONSTELLATION NAME</Text>
          <TextInput
            style={modal.input}
            value={name}
            onChangeText={setName}
            placeholder="E.G. SOLAR ORBIT"
            placeholderTextColor="rgba(255,255,255,0.18)"
            autoCapitalize="characters"
            maxLength={28}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />

          {/* Buttons */}
          <View style={modal.btnRow}>
            <TouchableOpacity style={modal.cancelBtn} onPress={handleDismiss}>
              <Text style={modal.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.confirmBtn, !name.trim() && modal.confirmBtnDisabled]}
              onPress={handleConfirm}
            >
              <Text style={modal.confirmText}>ADD ◆</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Add Star Modal ───────────────────────────────────────────────────────────
// Appears at zoom 2 when the user taps "+ ADD STAR". Creates a new star node
// in the selected constellation at the next available STAR_OFFSETS position.

function AddStarModal({ visible, starIndex, onConfirm, onDismiss }: {
  visible:   boolean;
  starIndex: number;
  onConfirm: (title: string) => void;
  onDismiss: () => void;
}) {
  const [title, setTitle] = useState('');

  const handleConfirm = () => {
    if (!title.trim()) return;
    onConfirm(title.trim());
    setTitle('');
  };

  const handleDismiss = () => { setTitle(''); onDismiss(); };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={modal.overlay} onPress={handleDismiss}>
        <Pressable style={modal.box} onPress={e => e.stopPropagation()}>

          <Text style={modal.prompt}>ADD A STAR</Text>
          <Text style={modal.subPrompt}>
            Star {starIndex + 1} of 5 in this constellation.
          </Text>

          <Text style={modal.inputLabel}>STAR NAME</Text>
          <TextInput
            style={modal.input}
            value={title}
            onChangeText={setTitle}
            placeholder="E.G. LAUNCH BETA"
            placeholderTextColor="rgba(255,255,255,0.18)"
            autoCapitalize="characters"
            maxLength={32}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            autoFocus
          />

          <View style={modal.btnRow}>
            <TouchableOpacity style={modal.cancelBtn} onPress={handleDismiss}>
              <Text style={modal.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.confirmBtn, !title.trim() && modal.confirmBtnDisabled]}
              onPress={handleConfirm}
            >
              <Text style={modal.confirmText}>ADD ◆</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:      { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg.base },

  domeTitle: {
    color:         colors.fg.primary,
    fontSize:      28,
    letterSpacing: 10,
    fontWeight:    '300',
    fontFamily:    typography.fonts.display,
    textAlign:     'center',
  },
  domeSubtitle: {
    color:         'rgba(168,230,255,0.7)',
    fontSize:      9,
    letterSpacing: 5,
    marginTop:     4,
    fontFamily:    typography.fonts.display,
    textAlign:     'center',
  },

  backBtn: {
    position: 'absolute',
    left:     18,
    zIndex:   15,
    padding:  4,
  },
  backBtnText: {
    color:         'rgba(255,255,255,0.5)',
    fontSize:      9,
    letterSpacing: 3,
    fontFamily:    typography.fonts.display,
  },

  plusContainer: {
    position:   'absolute',
    bottom:     22,
    left:       0,
    right:      0,
    zIndex:     15,
    alignItems: 'center',
  },
  plusBtn: {
    alignItems: 'center',
    gap:        5,
  },
  plusLabel: {
    color:         'rgba(255,255,255,0.3)',
    fontSize:      7,
    letterSpacing: 3,
    fontFamily:    typography.fonts.display,
  },
  addStarBtn: {
    borderWidth:  1,
    borderColor:  'rgba(168,230,255,0.32)',
    borderRadius: 20,
    paddingVertical:   7,
    paddingHorizontal: 20,
  },
  addStarText: {
    color:         colors.accent.cyan,
    fontSize:      8,
    letterSpacing: 3,
    fontFamily:    typography.fonts.display,
  },
});

// Modal styles — same design language as ConstellationConfirmModal
const modal = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  box: {
    backgroundColor: colors.bg.surface,
    borderWidth:     1,
    borderColor:     'rgba(168,230,255,0.16)',
    borderRadius:    10,
    width:           290,
    padding:         spacing.lg,
    alignItems:      'center',
  },
  prompt: {
    color:         colors.accent.cyan,
    fontSize:      8,
    letterSpacing: 4,
    marginBottom:  4,
    textAlign:     'center',
    fontFamily:    typography.fonts.display,
  },
  subPrompt: {
    color:         colors.fg.subtle,
    fontSize:      8,
    letterSpacing: 0.5,
    marginBottom:  spacing.md,
    textAlign:     'center',
    lineHeight:    14,
  },
  preview: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    color:         colors.fg.subtle,
    fontSize:      7,
    letterSpacing: 3,
    marginBottom:  spacing.xs,
    alignSelf:     'flex-start',
    fontFamily:    typography.fonts.display,
  },
  input: {
    width:           '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth:     1,
    borderColor:     'rgba(168,230,255,0.22)',
    borderRadius:    radii.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color:           colors.fg.primary,
    fontSize:        10,
    letterSpacing:   2,
    fontFamily:      typography.fonts.display,
    marginBottom:    spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    width:         '100%',
  },
  cancelBtn: {
    flex:        1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.sm,
    padding:     9,
    alignItems:  'center',
  },
  cancelText: {
    color:         colors.fg.subtle,
    fontSize:      8,
    letterSpacing: 2,
    fontFamily:    typography.fonts.display,
  },
  confirmBtn: {
    flex:            1,
    backgroundColor: 'rgba(45,108,223,0.18)',
    borderWidth:     1,
    borderColor:     'rgba(45,108,223,0.42)',
    borderRadius:    radii.sm,
    padding:         9,
    alignItems:      'center',
  },
  confirmBtnDisabled: {
    opacity: 0.3,
  },
  confirmText: {
    color:         colors.accent.cyan,
    fontSize:      8,
    letterSpacing: 2,
    fontFamily:    typography.fonts.display,
  },
});
