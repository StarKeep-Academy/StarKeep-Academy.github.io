/**
 * app/(auth)/login.tsx
 *
 * Email sign-in screen. Image 1 wireframe pattern (dome header + form below).
 * Social auth buttons redirect to allauth OAuth flow (web) — native token
 * exchange coming in Phase 1.1.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, Link } from 'expo-router';
import { colors, typography, spacing, radii } from '../../design-system/tokens';
import { authApi } from '../../features/auth/index';
import { useAuthStore } from '../../features/auth/store';
import { ApiError } from '../../lib/api-client';

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState<{ email?: string; password?: string; general?: string }>({});

  const login = useAuthStore(s => s.login);

  async function handleSignIn() {
    setErrors({});
    const next: typeof errors = {};

    if (!email.trim())    next.email    = 'Email is required.';
    if (!password.trim()) next.password = 'Password is required.';
    if (Object.keys(next).length) { setErrors(next); return; }

    setLoading(true);
    try {
      const result = await authApi.login({ email: email.trim(), password });
      await login(result.access, result.refresh);
      // (auth)/_layout.tsx handles the redirect once isAuthenticated flips
    } catch (err) {
      if (err instanceof ApiError && err.invalidParams?.length) {
        const mapped: typeof errors = {};
        for (const p of err.invalidParams) {
          if (p.field === 'email')    mapped.email    = p.message;
          if (p.field === 'password') mapped.password = p.message;
        }
        setErrors(Object.keys(mapped).length ? mapped : { general: err.detail });
      } else {
        setErrors({ general: err instanceof ApiError ? err.detail : 'Something went wrong. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSocialAuth() {
    Alert.alert('Coming Soon', 'Social sign-in launches in the next update.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Dome header */}
        <View style={styles.dome}>
          <Text style={styles.logoLine1}>STAR◆KEEP</Text>
          <Text style={styles.logoLine2}>ACADEMY</Text>
        </View>

        {/* Form */}
        <View style={styles.body}>
          <Text style={styles.title}>SIGN IN</Text>

          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="Email"
              placeholderTextColor={colors.fg.subtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          <View style={styles.field}>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              placeholder="Password"
              placeholderTextColor={colors.fg.subtle}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              onSubmitEditing={handleSignIn}
            />
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, (loading || pressed) && styles.primaryButtonPressed]}
            onPress={handleSignIn}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading
              ? <ActivityIndicator color={colors.fg.primary} />
              : <Text style={styles.primaryButtonText}>SIGN IN</Text>
            }
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
            onPress={handleSocialAuth}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <Text style={styles.socialButtonText}>CONTINUE WITH GOOGLE</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
            onPress={handleSocialAuth}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Text style={styles.socialButtonText}>CONTINUE WITH APPLE</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.footerLink}>Join the Academy</Text>
              </Pressable>
            </Link>
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  scroll: {
    flexGrow: 1,
  },
  dome: {
    height: 200,
    backgroundColor: colors.bg.dome,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  logoLine1: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  logoLine2: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.regular,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.widest,
    marginTop: spacing.xs,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  errorBanner: {
    backgroundColor: `${colors.semantic.danger}22`,
    borderWidth: 1,
    borderColor: colors.semantic.danger,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    color: colors.semantic.danger,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.body,
    textAlign: 'center',
  },
  field: {
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.bg.input,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.fg.primary,
    fontSize: typography.sizes.base,
    fontFamily: typography.fonts.body,
  },
  inputError: {
    borderColor: colors.semantic.danger,
  },
  fieldError: {
    color: colors.semantic.danger,
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.accent.blue,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.fg.primary,
    letterSpacing: typography.tracking.wider,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.default,
  },
  dividerLabel: {
    color: colors.fg.muted,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fonts.body,
    marginHorizontal: spacing.md,
    letterSpacing: typography.tracking.wider,
  },
  socialButton: {
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  socialButtonPressed: {
    borderColor: colors.fg.primary,
    opacity: 0.8,
  },
  socialButtonText: {
    fontFamily: typography.fonts.display,
    fontSize: typography.sizes.xs,
    color: colors.fg.muted,
    letterSpacing: typography.tracking.wide,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.fg.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.body,
  },
  footerLink: {
    color: colors.accent.cyan,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.display,
    letterSpacing: typography.tracking.wide,
  },
});
