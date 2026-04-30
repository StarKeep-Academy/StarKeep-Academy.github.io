/**
 * app/splash.tsx
 *
 * Entry point for unauthenticated users.
 *
 * Layout mirrors the radial nav menu — same sphere geometry — but shows only
 * the blue dome circle and the Starkeep logo image. No glyphs or needle.
 */

import { View, Image, Pressable, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { colors, typography, spacing, radii } from '../design-system/tokens';
import { useAuthStore } from '../features/auth/store';
import { avatarKeys, type AvatarProfile } from '../features/avatar/index';

const MOCK_AVATAR_ID = '00000000-0000-0000-0000-000000000002';

const mockAvatar: AvatarProfile = {
  id:            MOCK_AVATAR_ID,
  alias:         'DREAMWALKER',
  display_name:  'Dev User',
  level:         7,
  heroic_path: {
    slug:            'dreamwalker',
    display_name:    'Dreamwalker',
    campus:          'Soul Campus',
    campus_insignia: 'star_tetrahedron',
    glyph_url:       '/static/glyphs/heroic/dreamwalker.svg',
  },
  learning_path: {
    slug:         'divergent',
    display_name: 'Divergent',
    glyph_url:    '/static/glyphs/learning/divergent.svg',
  },
  purpose:      'Self-Actualization Architect',
  powers:       ['Creative Vision', 'Pattern Recognition'],
  archetype:    null,
  hours_of_impact: 120,
  impact_sources: [
    { label: 'Community Workshop Series', hours: 80 },
    { label: 'Youth Mentorship Program',  hours: 40 },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-04-25T00:00:00Z',
};

export default function SplashScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const devSeed     = useAuthStore(s => s.devSeed);
  const queryClient = useQueryClient();

  // Same sphere geometry as RadialNav
  const cx   = W / 2;
  const arcH = H / 3;
  const R    = Math.max(W * 0.76, 400);
  const cy   = arcH - R;

  return (
    <View style={styles.container}>

      {/* Blue sphere — uniform circle offset above screen, same as nav dome */}
      <View
        pointerEvents="none"
        style={{
          position:        'absolute',
          width:           R * 2,
          height:          R * 2,
          borderRadius:    R,
          backgroundColor: colors.bg.dome,
          left:            cx - R,
          top:             cy - R,
        }}
      />

      {/* Starkeep logo — centred in the dome region */}
      <View
        pointerEvents="none"
        style={[styles.logoWrap, { top: arcH * 0.25 }]}
      >
        <Image
          source={require('../assets/images/Starkeep_v2.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* Buttons below the arc */}
      <View style={[styles.body, { paddingTop: arcH + spacing.xxl }]}>
        <Pressable
          style={({ pressed }) => [styles.enterButton, pressed && styles.enterButtonPressed]}
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="button"
          accessibilityLabel="Enter Starkeep Academy"
        >
          <Text style={styles.enterButtonText}>ENTER WEBSITE</Text>
        </Pressable>

        {/* Dev-only preview bypass */}
        {__DEV__ && (
          <Pressable
            style={({ pressed }) => [styles.devButton, pressed && { opacity: 0.6 }]}
            onPress={() => {
              devSeed();
              queryClient.setQueryData(avatarKeys.detail(MOCK_AVATAR_ID), mockAvatar);
              router.replace('/(shell)/menu');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.devButtonText}>DEV PREVIEW</Text>
          </Pressable>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg.base,
    overflow:        'hidden',
  },

  logoWrap: {
    position:   'absolute',
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  logoImage: {
    width:  320,
    height: 120,
  },

  body: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'flex-start',
  },
  enterButton: {
    borderWidth:       1.5,
    borderColor:       colors.fg.muted,
    borderRadius:      radii.full,
    paddingVertical:   spacing.sm + 2,
    paddingHorizontal: spacing.xxl,
  },
  enterButtonPressed: {
    borderColor: colors.fg.primary,
    opacity:     0.8,
  },
  enterButtonText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.sm,
    color:         colors.fg.muted,
    letterSpacing: typography.tracking.wider,
  },
  devButton: {
    marginTop:         spacing.lg,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.xl,
    borderWidth:       1,
    borderColor:       colors.semantic.warning,
    borderRadius:      radii.full,
  },
  devButtonText: {
    fontFamily:    typography.fonts.display,
    fontSize:      typography.sizes.xs,
    color:         colors.semantic.warning,
    letterSpacing: typography.tracking.wider,
  },
});
