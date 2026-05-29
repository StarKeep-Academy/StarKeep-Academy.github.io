/**
 * features/starmap/components/ConstellationConfirmModal.tsx
 *
 * One-by-one constellation confirmation flow.
 * Shows the ghost shape silhouette + name.
 * Confirm — constellation radiates to its position.
 * Dismiss — suggestion vanishes, next appears.
 */

import React from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  StyleSheet, Pressable,
} from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { colors, spacing, radii, typography } from '../../../design-system/tokens';
import { ConstSuggestion, STAR_OFFSETS } from '../hooks/useStarMapState';

interface Props {
  visible:          boolean;
  suggestion:       ConstSuggestion | null;
  constellationIdx: number;     // used to pick the shape preview
  onConfirm:        () => void;
  onDismiss:        () => void;
}

export function ConstellationConfirmModal({
  visible, suggestion, constellationIdx, onConfirm, onDismiss,
}: Props) {
  if (!suggestion) return null;

  const shapeIdx = constellationIdx % 4;
  const offs     = STAR_OFFSETS[shapeIdx] ?? STAR_OFFSETS[0];
  const SCALE    = 0.36;
  const CX5      = 45;
  const CY5      = 38;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.box} onPress={e => e.stopPropagation()}>

          <Text style={styles.prompt}>IS THIS A CHAPTER OF YOUR JOURNEY?</Text>
          <Text style={styles.name}>{suggestion.name}</Text>
          <Text style={styles.hint}>{suggestion.hint}</Text>

          {/* Ghost shape preview */}
          <View style={styles.preview}>
            <Svg width={90} height={64}>
              {offs.slice(0, -1).map((o, i) => {
                const next = offs[i + 1];
                if (!next) return null;
                return (
                  <Line
                    key={`l-${i}`}
                    x1={CX5 + o.x * SCALE}
                    y1={CY5 + o.y * SCALE}
                    x2={CX5 + next.x * SCALE}
                    y2={CY5 + next.y * SCALE}
                    stroke="rgba(168,230,255,0.22)"
                    strokeWidth={0.5}
                  />
                );
              })}
              {offs.map((o, i) => (
                <Circle
                  key={`c-${i}`}
                  cx={CX5 + o.x * SCALE}
                  cy={CY5 + o.y * SCALE}
                  r={2.5}
                  fill="none"
                  stroke="rgba(168,230,255,0.42)"
                  strokeWidth={1}
                />
              ))}
            </Svg>
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmBtnText}>CONFIRM ◆</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  box: {
    backgroundColor: colors.bg.surface,
    borderWidth:     1,
    borderColor:     'rgba(168,230,255,0.16)',
    borderRadius:    10,
    width:           270,
    padding:         spacing.lg,
    alignItems:      'center',
  },
  prompt: {
    color:         colors.accent.cyan,
    fontSize:      7,
    letterSpacing: 4,
    marginBottom:  spacing.sm,
    textAlign:     'center',
    fontFamily:    typography.fonts.display,
  },
  name: {
    color:         colors.fg.primary,
    fontSize:      12,
    letterSpacing: 3,
    marginBottom:  4,
    fontFamily:    typography.fonts.display,
    textAlign:     'center',
  },
  hint: {
    color:         colors.fg.subtle,
    fontSize:      8,
    letterSpacing: 1,
    marginBottom:  spacing.md,
    textAlign:     'center',
  },
  preview: {
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    width:         '100%',
  },
  dismissBtn: {
    flex:        1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.sm,
    padding:      9,
    alignItems:   'center',
  },
  dismissBtnText: {
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
  confirmBtnText: {
    color:         colors.accent.cyan,
    fontSize:      8,
    letterSpacing: 2,
    fontFamily:    typography.fonts.display,
  },
});
