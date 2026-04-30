/**
 * app/(shell)/settings/index.tsx
 *
 * Phase 6. Sign-out is available now (auth); full settings UI ships in Phase 6.
 * Sign-out is the only live action in Phase 1.
 */

import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';
import { useAuthStore } from '../../../features/auth/store';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore(s => ({ user: s.user, logout: s.logout }));

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // (shell)/_layout.tsx redirects to /splash when isAuthenticated flips
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.homeBtn}>
        <Text style={styles.homeText}>‹ MENU</Text>
      </Pressable>
      <Text style={styles.title}>SETTINGS</Text>

      {user && (
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Signed in as</Text>
          <Text style={styles.accountEmail}>{user.email}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </Pressable>

      <Text style={styles.phaseSub}>Full settings coming in Phase 6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
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
  title: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.lg,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  accountRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountLabel: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.sm,
    color: colors.fg.muted,
  },
  accountEmail: {
    fontFamily: typography.fonts.mono,
    fontSize: typography.sizes.base,
    color: colors.fg.primary,
  },
  signOutButton: {
    borderWidth: 1.5,
    borderColor: colors.semantic.danger,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    color: colors.semantic.danger,
    letterSpacing: typography.tracking.wider,
  },
  phaseSub: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.xs,
    color: colors.fg.subtle,
  },
});
