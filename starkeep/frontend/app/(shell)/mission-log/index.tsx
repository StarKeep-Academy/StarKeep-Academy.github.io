/**
 * app/(shell)/mission-log/index.tsx
 *
 * Phase 4 (missions + quests).
 * Stub screen — routes and shell are wired.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { colors, typography, spacing } from '../../../design-system/tokens';

export default function MissionLogScreen() {
  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.homeBtn}>
        <Text style={styles.homeText}>‹ MENU</Text>
      </Pressable>
      <Text style={styles.label}>MISSION LOG</Text>
      <Text style={styles.sub}>Coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  homeBtn: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    padding: spacing.sm,
  },
  homeText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },
  label: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.lg,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  sub: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
  },
});
