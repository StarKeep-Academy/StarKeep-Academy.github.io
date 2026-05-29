/**
 * features/starmap/components/GoalInputModal.tsx
 *
 * The "What is your goal?" modal.
 * Top item pre-filled from archetype quiz purpose_seed.
 * Opens when: empty state + button tapped, or new constellation button tapped.
 */

import React from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { colors, spacing, radii, typography } from '../../../design-system/tokens';
import { GOALS } from '../hooks/useStarMapState';

interface Props {
  visible:       boolean;
  selectedGoal:  string;
  onSelectGoal:  (goal: string) => void;
  onConfirm:     () => void;
  onDismiss:     () => void;
  // Optional: pre-filled from archetype quiz (purpose_seed from /avatars/{id}/archetype)
  purposeSeed?:  string;
}

export function GoalInputModal({
  visible, selectedGoal, onSelectGoal, onConfirm, onDismiss, purposeSeed,
}: Props) {
  const options = purposeSeed
    ? [purposeSeed, ...GOALS.filter(g => g !== purposeSeed)]
    : GOALS;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.box} onPress={e => e.stopPropagation()}>

          <Text style={styles.heading}>WHAT IS YOUR GOAL?</Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {options.map((goal, i) => {
              const selected = goal === selectedGoal;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => onSelectGoal(goal)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
            <Text style={styles.confirmBtnText}>SET NORTH STAR</Text>
          </TouchableOpacity>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width:           310,
    padding:         spacing.lg,
    maxHeight:       '70%',
  },
  heading: {
    color:         colors.fg.primary,
    fontSize:      10,
    letterSpacing: 4,
    textAlign:     'center',
    marginBottom:  spacing.md,
    fontFamily:    typography.fonts.display,
  },
  list: {
    maxHeight: 260,
  },
  option: {
    paddingVertical:   9,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    borderRadius:      3,
  },
  optionSelected: {
    backgroundColor: 'rgba(168,230,255,0.06)',
    borderLeftWidth: 2,
    borderLeftColor: colors.accent.cyan,
  },
  optionText: {
    color:         '#777',
    fontSize:      9,
    letterSpacing: 1,
  },
  optionTextSelected: {
    color: colors.accent.cyan,
  },
  confirmBtn: {
    backgroundColor: 'rgba(45,108,223,0.14)',
    borderWidth:     1,
    borderColor:     'rgba(45,108,223,0.38)',
    borderRadius:    radii.sm,
    padding:         spacing.sm + 2,
    alignItems:      'center',
    marginTop:       spacing.md,
  },
  confirmBtnText: {
    color:         colors.accent.cyan,
    fontSize:      9,
    letterSpacing: 3,
    fontFamily:    typography.fonts.display,
  },
});
