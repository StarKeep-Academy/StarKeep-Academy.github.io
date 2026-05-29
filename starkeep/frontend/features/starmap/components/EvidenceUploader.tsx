/**
 * features/starmap/components/EvidenceUploader.tsx
 *
 * Evidence section inside the StarDetailPanel.
 * v1: tap to add a mock evidence item (filename).
 * Phase 4+: replace onAdd with actual image picker / GCS upload.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radii } from '../../../design-system/tokens';

interface EvidenceItem {
  label: string;
}

interface Props {
  evidence: EvidenceItem[];
  onAdd:    () => void;
}

export function EvidenceUploader({ evidence, onAdd }: Props) {
  return (
    <View>
      {/* Existing items */}
      {evidence.map((e, i) => (
        <View key={i} style={styles.item}>
          <Text style={styles.itemText}>📎 {e.label}</Text>
        </View>
      ))}

      {/* Empty hint */}
      {evidence.length === 0 && (
        <Text style={styles.empty}>No evidence yet</Text>
      )}

      {/* Upload zone */}
      <TouchableOpacity style={styles.zone} onPress={onAdd} activeOpacity={0.7}>
        <Text style={styles.zonePrimary}>+ ADD EVIDENCE</Text>
        <Text style={styles.zoneSecondary}>photo · link · text note</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: 4,
  },
  itemText: {
    color:         colors.accent.cyan,
    fontSize:      9,
    letterSpacing: 0.5,
  },
  empty: {
    color:         '#3a3a3a',
    fontSize:      8,
    letterSpacing: 1,
    marginBottom:  spacing.sm,
  },
  zone: {
    borderWidth:   1,
    borderStyle:   'dashed',
    borderColor:   'rgba(168,230,255,0.18)',
    borderRadius:  radii.sm,
    padding:       spacing.md,
    alignItems:    'center',
    marginTop:     spacing.sm,
  },
  zonePrimary: {
    color:         '#444',
    fontSize:      8,
    letterSpacing: 2,
    marginBottom:  2,
  },
  zoneSecondary: {
    color:         '#333',
    fontSize:      7,
    letterSpacing: 1,
  },
});
