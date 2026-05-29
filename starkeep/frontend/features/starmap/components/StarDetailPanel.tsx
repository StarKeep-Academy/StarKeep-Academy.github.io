/**
 * features/starmap/components/StarDetailPanel.tsx
 *
 * The side panel that slides in from the right when a star is tapped.
 * Contains: status, title, planet checklist, evidence upload, submit button.
 *
 * Slides in from right using Animated.Value.
 * Width: 340px (used by useStarMapState to calculate center offset).
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Animated, StyleSheet, Pressable,
} from 'react-native';
import { colors, spacing, typography, radii } from '../../../design-system/tokens';
import { StarNode } from '../hooks/useStarMapState';
import { PlanetChecklist } from './PlanetChecklist';
import { EvidenceUploader } from './EvidenceUploader';

export const PANEL_WIDTH = 340;

interface Props {
  open:           boolean;
  star:           StarNode | null;
  onClose:        () => void;
  onTogglePlanet: (starId: string, idx: number) => void;
  onAddEvidence:  (starId: string) => void;
  onSubmit:       (starId: string) => void;
  onAiSplit:      (starId: string) => void;
}

export function StarDetailPanel({
  open, star, onClose,
  onTogglePlanet, onAddEvidence, onSubmit, onAiSplit,
}: Props) {
  const slideAnim = useRef(new Animated.Value(PANEL_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue:         open ? 0 : PANEL_WIDTH,
      duration:        320,
      useNativeDriver: true,
    }).start();
  }, [open]);

  if (!star) return null;

  const statusColor = {
    approved:  colors.semantic.success,
    submitted: colors.semantic.warning,
    active:    colors.accent.cyan,
    pending:   colors.fg.subtle,
  }[star.status] ?? colors.fg.subtle;

  const statusLabel = {
    approved:  `✓ COMPLETED${star.completedDate ? ` · ${star.completedDate}` : ''}`,
    submitted: 'SUBMITTED — AWAITING VALIDATION',
    active:    'IN PROGRESS',
    pending:   'PENDING',
  }[star.status] ?? 'PENDING';

  const allPlanetsDone = star.planets.length > 0 && star.planets.every(p => p.done);
  const hasEvidence    = star.evidence.length > 0;

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateX: slideAnim }] }]}>
      {/* Close button */}
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeBtnText}>×</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Status */}
        <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>

        {/* Title */}
        <Text style={styles.title}>{star.title}</Text>

        {/* LUX pill — approved only */}
        {star.status === 'approved' && star.lux && (
          <View style={styles.luxPill}>
            <Text style={styles.luxPillText}>◆ +{star.lux} LUX</Text>
          </View>
        )}

        {/* Description */}
        <Text style={styles.desc}>{star.desc}</Text>

        {/* ── Planet checklist (incomplete stars only) ── */}
        {star.status !== 'approved' && star.planets.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PLANETS</Text>
            <PlanetChecklist
              planets={star.planets}
              onToggle={idx => onTogglePlanet(star.id, idx)}
            />
            {allPlanetsDone && (
              <View style={styles.allDonePrompt}>
                <Text style={styles.allDoneTitle}>◆ ALL PLANETS COMPLETE</Text>
                <Text style={styles.allDoneHint}>Submit star-level evidence below</Text>
              </View>
            )}
          </>
        )}

        {/* ── Evidence ── */}
        {star.status !== 'approved' ? (
          <>
            <Text style={styles.sectionLabel}>EVIDENCE</Text>
            <EvidenceUploader
              evidence={star.evidence}
              onAdd={() => onAddEvidence(star.id)}
            />
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>EVIDENCE SUBMITTED</Text>
            {star.evidence.map((e, i) => (
              <Text key={i} style={styles.evidenceItem}>📎 {e.label}</Text>
            ))}
          </>
        )}

        {/* ── Archived planets (approved) ── */}
        {star.status === 'approved' && star.planets.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PLANETS ARCHIVED</Text>
            <PlanetChecklist planets={star.planets} readOnly />
          </>
        )}

        {/* ── Submit button ── */}
        {star.status !== 'approved' && (
          <Pressable
            style={[styles.submitBtn, !hasEvidence && styles.submitBtnDisabled]}
            onPress={() => hasEvidence && onSubmit(star.id)}
          >
            <Text style={styles.submitBtnText}>SUBMIT FOR VALIDATION</Text>
          </Pressable>
        )}

        {/* ── AI split button ── */}
        {star.status !== 'approved' && (
          <Pressable style={styles.aiBtn} onPress={() => onAiSplit(star.id)}>
            <Text style={styles.aiBtnText}>◆ AI: SUGGEST HOW TO SPLIT THIS STAR</Text>
          </Pressable>
        )}

      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position:        'absolute',
    top:             0,
    right:           0,
    width:           PANEL_WIDTH,
    height:          '100%',
    backgroundColor: colors.bg.surface,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(168,230,255,0.1)',
    zIndex:          12,
  },
  closeBtn: {
    position: 'absolute',
    top:      14,
    right:    14,
    zIndex:   1,
    padding:  4,
  },
  closeBtnText: {
    color:    colors.fg.subtle,
    fontSize: 16,
  },
  scroll: {
    paddingTop:        52,
    paddingBottom:     24,
    paddingHorizontal: spacing.md,
  },
  status: {
    fontSize:      8,
    letterSpacing: 3,
    marginBottom:  spacing.sm,
  },
  title: {
    color:         colors.fg.primary,
    fontSize:      12,
    letterSpacing: 2,
    marginBottom:  spacing.sm,
    lineHeight:    18,
    fontFamily:    typography.fonts.display,
  },
  luxPill: {
    flexDirection:     'row',
    alignSelf:         'flex-start',
    backgroundColor:   'rgba(232,177,74,0.1)',
    borderWidth:       1,
    borderColor:       'rgba(232,177,74,0.28)',
    borderRadius:      20,
    paddingVertical:   3,
    paddingHorizontal: spacing.sm,
    marginBottom:      spacing.sm,
  },
  luxPillText: {
    color:         colors.accent.gold,
    fontSize:      9,
    letterSpacing: 1,
    fontFamily:    typography.fonts.mono,
  },
  desc: {
    color:         colors.fg.muted,
    fontSize:      10,
    letterSpacing: 0.5,
    lineHeight:    17,
    marginBottom:  spacing.xs,
  },
  sectionLabel: {
    color:         colors.accent.cyan,
    fontSize:      8,
    letterSpacing: 4,
    marginTop:     spacing.md,
    marginBottom:  spacing.sm,
  },
  evidenceItem: {
    color:           colors.accent.cyan,
    fontSize:        9,
    letterSpacing:   0.5,
    paddingVertical: 4,
  },
  allDonePrompt: {
    backgroundColor: 'rgba(232,177,74,0.07)',
    borderWidth:     1,
    borderColor:     'rgba(232,177,74,0.22)',
    borderRadius:    radii.sm,
    padding:         spacing.sm,
    marginTop:       spacing.sm,
    alignItems:      'center',
  },
  allDoneTitle: {
    color:         colors.accent.gold,
    fontSize:      9,
    letterSpacing: 2,
  },
  allDoneHint: {
    color:         colors.fg.subtle,
    fontSize:      8,
    marginTop:     2,
    letterSpacing: 1,
  },
  submitBtn: {
    backgroundColor: 'rgba(45,108,223,0.14)',
    borderWidth:     1,
    borderColor:     'rgba(45,108,223,0.38)',
    borderRadius:    radii.sm,
    padding:         spacing.sm + 2,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.28,
  },
  submitBtnText: {
    color:         colors.accent.cyan,
    fontSize:      9,
    letterSpacing: 3,
    fontFamily:    typography.fonts.display,
  },
  aiBtn: {
    borderWidth:   1,
    borderColor:   'rgba(232,177,74,0.22)',
    borderRadius:  radii.sm,
    padding:       spacing.sm,
    alignItems:    'center',
    marginTop:     spacing.sm,
  },
  aiBtnText: {
    color:         colors.accent.gold,
    fontSize:      8,
    letterSpacing: 2,
    fontFamily:    typography.fonts.display,
  },
});
