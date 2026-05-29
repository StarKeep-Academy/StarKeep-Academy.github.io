/**
 * features/starmap/components/PlanetChecklist.tsx
 *
 * Planet checklist inside the StarDetailPanel.
 * Planets are ordered by proximity (order field = sequence).
 * Completed planets show a locked glow dot.
 * readOnly = archived view for completed stars.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../../../design-system/tokens';
import { Planet } from '../hooks/useStarMapState';

interface Props {
  planets:  Planet[];
  onToggle?: (idx: number) => void;
  readOnly?: boolean;
}

export function PlanetChecklist({ planets, onToggle, readOnly }: Props) {
  // Sort by order (innermost = first)
  const sorted = [...planets].sort((a, b) => a.order - b.order);

  return (
    <View>
      {sorted.map((planet, i) => (
        <TouchableOpacity
          key={planet.id}
          style={styles.row}
          onPress={() => !readOnly && onToggle?.(planets.indexOf(planet))}
          activeOpacity={readOnly ? 1 : 0.7}
        >
          {/* Planet indicator dot */}
          <View style={[styles.dot, planet.done && styles.dotDone]} />

          {/* Label */}
          <Text style={[styles.label, planet.done && styles.labelDone]}>
            {planet.label}
          </Text>

          {/* Step order */}
          <Text style={styles.order}>step {planet.order}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.sm,
    paddingVertical:   7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dot: {
    width:        9,
    height:       9,
    borderRadius: 5,
    borderWidth:  1.5,
    borderColor:  'rgba(168,230,255,0.45)',
    flexShrink:   0,
  },
  dotDone: {
    backgroundColor: colors.accent.cyan,
    borderColor:     colors.accent.cyan,
  },
  label: {
    flex:          1,
    color:         '#999',
    fontSize:      9,
    letterSpacing: 0.5,
  },
  labelDone: {
    color:              '#444',
    textDecorationLine: 'line-through',
  },
  order: {
    color:    '#383838',
    fontSize: 8,
  },
});
