/**
 * app/(shell)/avatar/quiz.tsx
 *
 * Archetype quiz WebView (DEC-007 Mode A — hosted iframe).
 * The external quiz repo posts signed results directly to the backend
 * on completion. We detect completion by watching for a redirect to a
 * URL that contains "quiz-complete".
 *
 * Set EXPO_PUBLIC_QUIZ_URL in frontend/.env to enable.
 * Coordinate URL and HMAC secret with quiz repo team (see DEC-007).
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../features/auth/store';
import { avatarKeys } from '../../../features/avatar/index';
import { colors, typography, spacing, radii } from '../../../design-system/tokens';

// Loaded from EXPO_PUBLIC_QUIZ_URL in .env (coordinate with quiz repo — DEC-007)
const QUIZ_BASE_URL = process.env.EXPO_PUBLIC_QUIZ_URL ?? '';

// ─── Conditional WebView import ───────────────────────────────────────────────
// react-native-webview is not available on all platforms in every config.
// Lazy require so a missing package doesn't crash the JS bundle on web.
let WebView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = require('react-native-webview').WebView;
} catch {
  // Not installed or not available on this platform
}

export default function QuizScreen() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const avatarId     = useAuthStore(s => s.avatarId);
  const [loading, setLoading] = useState(true);
  const [done,    setDone]    = useState(false);

  function handleComplete() {
    if (done) return;
    setDone(true);
    // Invalidate avatar cache so the profile screen re-fetches with archetype data
    if (avatarId) {
      queryClient.invalidateQueries({ queryKey: avatarKeys.detail(avatarId) });
      queryClient.invalidateQueries({ queryKey: avatarKeys.archetype(avatarId) });
    }
    Alert.alert(
      'Quiz Complete!',
      'Your archetype profile is being updated. Return to your Avatar to see the results.',
      [{ text: 'View Avatar', onPress: () => router.replace('/(shell)/avatar') }],
    );
  }

  // Show "not configured" state when quiz URL isn't set
  if (!QUIZ_BASE_URL) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>ARCHETYPE QUIZ</Text>
          <Text style={styles.subtitle}>
            The quiz URL is not yet configured.{'\n'}
            Coordinate with the quiz repo team per DEC-007.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>GO BACK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Show fallback if WebView package is unavailable (e.g. web target without config)
  if (!WebView) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>ARCHETYPE QUIZ</Text>
          <Text style={styles.subtitle}>
            WebView is not available on this platform.{'\n'}
            Please use the iOS or Android app to take the quiz.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>GO BACK</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const quizUrl = `${QUIZ_BASE_URL}?avatar_id=${avatarId ?? ''}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close quiz"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>ARCHETYPE QUIZ</Text>
        <View style={styles.closeButton} />
      </View>

      {/* WebView */}
      <WebView
        source={{ uri: quizUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={()  => setLoading(false)}
        onNavigationStateChange={(state: { url: string }) => {
          // Quiz redirects to a URL containing "quiz-complete" on finish
          if (state.url?.includes('quiz-complete')) {
            handleComplete();
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
      />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.accent.cyan} size="large" />
          <Text style={styles.loadingText}>Loading quiz…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.lg,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  subtitle: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.muted,
    textAlign: 'center',
    lineHeight: typography.sizes.base * 1.6,
  },
  backButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radii.full,
  },
  backButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },

  // WebView screen
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  headerTitle: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  closeButton: {
    width: 32,
    alignItems: 'center',
  },
  closeText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.md,
    color: colors.fg.muted,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.base,
    color: colors.fg.muted,
  },
});
